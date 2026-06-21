import { GoodsReceived } from '../shared/receiving/GoodsReceived';
import { useRetailReceivingConfig } from './receivingConfig';

export function ProductsReceivedView({
  currentUser,
}: {
  currentUser: { email: string; role: string } | null;
}) {
  void currentUser;
  const config = useRetailReceivingConfig();
  return <GoodsReceived config={config} />;
}
