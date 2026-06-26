import AuctionRoom from "@/components/AuctionRoom";

/**
 * Auction detail page — renders the interactive AuctionRoom for
 * a specific auction ID extracted from the URL.
 *
 * This is a Server Component that extracts the `id` param and
 * passes it to the client-interactive AuctionRoom.
 */
export default async function AuctionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let auctionId: bigint;
  try {
    auctionId = BigInt(id);
  } catch {
    return (
      <main className="flex flex-1 items-center justify-center p-12">
        <div className="border-4 border-red-600 bg-red-50 p-6 text-center shadow-[6px_6px_0px_0px_#dc2626]">
          <p className="text-lg font-bold text-red-900">Invalid auction ID</p>
        </div>
      </main>
    );
  }

  return <AuctionRoom auctionId={auctionId} />;
}
