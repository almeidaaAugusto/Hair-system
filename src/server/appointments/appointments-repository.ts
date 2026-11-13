import type {
  Appointment,
  CompleteAppointmentInput,
  CreateAppointmentInput,
  CreateTimeBlockInput,
  Payment,
  RescheduleInput,
  TimeBlock,
} from "@/domain/appointments/appointment";
import type { AvailabilityWindow } from "@/domain/appointments/availability";
import type { BUSINESS_HOURS_TIME_ZONE } from "@/domain/business-hours/business-hours";

export type AvailabilityQuery = { date: string; serviceId: string; excludeAppointmentId?: string };
export type AvailabilityResult = {
  date: string;
  timezone: typeof BUSINESS_HOURS_TIME_ZONE;
  serviceId: string;
  durationMinutes: number;
  appointmentIntervalMinutes: number;
  windows: AvailabilityWindow[];
};
export type AppointmentsDayResult = {
  date: string;
  timezone: typeof BUSINESS_HOURS_TIME_ZONE;
  appointments: Appointment[];
  timeBlocks: TimeBlock[];
};
export type AppointmentsRangeResult = {
  from: string;
  to: string;
  timezone: typeof BUSINESS_HOURS_TIME_ZONE;
  appointments: Appointment[];
  timeBlocks: TimeBlock[];
};
export type ReserveAppointmentResult = { appointment: Appointment; replayed: boolean };
export type CreateTimeBlockResult = { timeBlock: TimeBlock; replayed: boolean };

export type AppointmentsRepository = {
  getAvailability(salonId: string, input: AvailabilityQuery): Promise<AvailabilityResult>;
  getDay(salonId: string, date: string): Promise<AppointmentsDayResult>;
  getRange(salonId: string, from: string, to: string): Promise<AppointmentsRangeResult>;
  reserve(
    salonId: string,
    userId: string,
    input: CreateAppointmentInput,
  ): Promise<ReserveAppointmentResult>;
  /** Appointments of a client, most recent first (includes cancelled ones). */
  listByClient(salonId: string, clientId: string): Promise<Appointment[]>;
  cancel(salonId: string, userId: string, appointmentId: string): Promise<Appointment>;
  complete(
    salonId: string,
    userId: string,
    appointmentId: string,
    input: CompleteAppointmentInput,
  ): Promise<Appointment>;
  markNoShow(salonId: string, userId: string, appointmentId: string): Promise<Appointment>;
  markReminderSent(salonId: string, userId: string, appointmentId: string): Promise<Appointment>;
  markClientConfirmed(salonId: string, userId: string, appointmentId: string): Promise<Appointment>;
  reschedule(
    salonId: string,
    userId: string,
    appointmentId: string,
    input: RescheduleInput,
  ): Promise<Appointment>;
  recordPayment(
    salonId: string,
    userId: string,
    appointmentId: string,
    payment: Payment,
  ): Promise<Appointment>;
  createBlock(
    salonId: string,
    userId: string,
    input: CreateTimeBlockInput,
  ): Promise<CreateTimeBlockResult>;
  cancelBlock(salonId: string, userId: string, blockId: string): Promise<TimeBlock>;
};
