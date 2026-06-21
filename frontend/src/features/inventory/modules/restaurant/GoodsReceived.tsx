import { GoodsReceived as GoodsReceivedShared } from '../shared/receiving/GoodsReceived';
import { useRestaurantReceivingConfig } from './receivingConfig';

export function GoodsReceived() {
  const config = useRestaurantReceivingConfig();
  // The restaurant shell doesn't add page padding, so the shared view would hug
  // the top-left corner. Pad here (retail's layout already provides spacing).
  return (
    <div className="p-8">
      <GoodsReceivedShared config={config} />
    </div>
  );
}
