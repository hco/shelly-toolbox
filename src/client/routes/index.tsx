import { createFileRoute } from '@tanstack/react-router';
import { DeviceList } from '@/client/components/DeviceList.js';

export const Route = createFileRoute('/')({
  component: DeviceList,
});
