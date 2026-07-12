import { notFound, redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/operator/session";
import { getBooking } from "@/lib/bookings/repo";
import { getOrderByBookingId } from "@/lib/orders/repo";
import { listDocuments } from "@/lib/documents/repo";
import { BookingDetail } from "@/components/operator/bookings/BookingDetail";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: { id: string } }) {
  const membership = await getSessionMembership();
  if (!membership) redirect("/login");
  const op = membership.operator;
  const isAdmin = membership.role === "admin";

  let booking;
  try {
    booking = await getBooking(params.id);
  } catch {
    notFound();
  }
  if (!booking || booking.operatorId !== op.id) notFound();

  const order = await getOrderByBookingId(params.id);
  // Documents are admin-only; employees don't see the attach panel.
  const documents = isAdmin ? await listDocuments(op.id, { bookingId: params.id }) : [];
  return (
    <BookingDetail
      booking={booking}
      payment={
        order
          ? { status: order.status, amountTotal: order.amountTotal, esignStatus: order.esignStatus }
          : null
      }
      documents={documents}
      isAdmin={isAdmin}
    />
  );
}
