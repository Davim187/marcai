/** Eventos de domínio de agendamento → notificações. Implementado na fase 5. */
export async function onBookingCreated(
  _bookingId: string,
  _opts: { notifyCustomer?: boolean } = {},
) {}
export async function onBookingCanceled(_bookingId: string, _by: 'customer' | 'professional') {}
export async function onBookingRescheduled(
  _bookingId: string,
  _previousStartsAt: Date,
  _by: 'customer' | 'professional',
) {}
export async function onBookingConfirmedByCustomer(_bookingId: string) {}
