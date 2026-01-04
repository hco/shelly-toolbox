import { createFileRoute } from '@tanstack/react-router';
import { Settings } from '@/client/components/Settings.js';

export const Route = createFileRoute('/settings')({
  component: Settings,
});
