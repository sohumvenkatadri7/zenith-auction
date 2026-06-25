import AuctionRoom from "@/components/AuctionRoom";

/**
 * Home page — renders the live auction room.
 *
 * This is a Server Component that simply renders the
 * client-interactive `AuctionRoom` as its child.  All
 * blockchain logic, wallet interaction, and real-time
 * updates live inside the client components.
 */
export default function Home() {
  return <AuctionRoom />;
}
