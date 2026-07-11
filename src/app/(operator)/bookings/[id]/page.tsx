import { notFound, redirect } from "next/navigation";
import { getSessionOperator } from "@/lib/operator/session";
import { getBooking } from "@/lib/bookings/repo";
import { getOrderByBookingId } from "@/lib/orders/repo";
import { listDocuments } from "@/lib/documents/repo";
import { BookingDetail } from "@/components/operator/bookings/BookingDetail";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: { id: string } }) {
  const op = await getSessionOperator();
  if (!op) redirect("/login");

  let booking;
  try {
    booking = await getBooking(params.id);
  } catch {
    notFound();
  }
  if (!booking || booking.operatorId !== op.id) notFound();

  const order = await getOrderByBookingId(params.id);
  const documents = await listDocuments(op.id, { bookingId: params.id });
  return (
    <BookingDetail
      booking={booking}
      payment={
        order
          ? { status: order.status, amountTotal: order.amountTotal, esignStatus: order.esignStatus }
          : null
      }
      documents={documents}
    />
  );
}
