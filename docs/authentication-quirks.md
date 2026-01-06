# Shelly Device Authentication Quirks

## Gen2+ Devices: Endpoint-Specific Authentication

**CRITICAL:** Not all RPC endpoints require authentication, even when `auth_en: true`!

### The Problem

Some Gen2+ Shelly devices allow unauthenticated access to certain "safe" RPC methods, even when authentication is enabled on the device. This creates a challenge when trying to verify if a configured password is correct.

### Known Endpoints

- **`/shelly`** - NEVER requires auth (always accessible)
- **`Shelly.GetDeviceInfo`** - MAY allow unauth access even when `auth_en: true` ⚠️
- **`WiFi.GetConfig`** - ALWAYS requires auth when `auth_en: true` ✓

### Why This Matters

When testing if a password is correct, we MUST use an endpoint that always requires authentication. If we use `Shelly.GetDeviceInfo`:

1. Device has `auth_en: true`
2. We call `/rpc/Shelly.GetDeviceInfo` expecting 401
3. Device returns 200 OK (allowed without auth)
4. We incorrectly conclude the password is wrong

### Solution

**Always use `/rpc/WiFi.GetConfig` for password validation** (see `testGen2Password` in `shellyService.ts`).

### History

- **Initial bug (pre d2cb7d5)**: Function returned `'correct_password'` when getting 200 OK, causing devices with different passwords to show as authenticated
- **First fix attempt (d2cb7d5)**: Changed to return `'different_password'` for non-401 responses, but this caused devices with correct passwords to show as different passwords
- **Correct fix (current)**: Changed endpoint from `Shelly.GetDeviceInfo` to `WiFi.GetConfig` which always requires auth

### Testing Checklist

When modifying authentication code:
- [ ] Verify you're using an endpoint that ALWAYS requires auth for password validation
- [ ] Test with devices that have auth enabled
- [ ] Test with devices that have auth disabled
- [ ] Test with correct password configured
- [ ] Test with wrong/no password configured
- [ ] Check server logs for authentication flow details
