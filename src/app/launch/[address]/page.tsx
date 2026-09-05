import { TokenDashboard } from "@/components/TokenDashboard";

export default function LaunchPage({ params }: { params: { address: string } }) {
  return <TokenDashboard address={params.address} />;
}
