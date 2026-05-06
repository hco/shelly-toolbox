import { createFileRoute } from '@tanstack/react-router';
import { Scripts } from '@/client/components/Scripts.js';

export const Route = createFileRoute('/scripts')({
  component: Scripts,
} as any);
