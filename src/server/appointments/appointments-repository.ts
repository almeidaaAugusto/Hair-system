import type {
  Appointment,
  CreateAppointmentInput,
  CreateTimeBlockInput,
  TimeBlock,
} from "@/domain/appointments/appointment";
import type { AvailabilityWindow } from "@/domain/appointments/availability";
import type { BUSINESS_HOURS_TIME_ZONE } from "@/domain/business-hours/business-hours";

export type AvailabilityQuery = { date: string; serviceId: string };
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
export type ReserveAppointmentResult = { appointment: Appointment; replayed: boolean };
export type CreateTimeBlockResult = { timeBlock: TimeBlock; replayed: boolean };

export type AppointmentsRepository = {
  getAvailability(salonId: string, input: AvailabilityQuery): Promise<AvailabilityResult>;
  getDay(salonId: string, date: string): Promise<AppointmentsDayResult>;
  reserve(
    salonId: string,
    userId: string,
    input: CreateAppointmentInput,
  ): Promise<ReserveAppointmentResult>;
  cancel(salonId: string, userId: string, appointmentId: string): Promise<Appointment>;
  createBlock(
    salonId: string,
    userId: string,
    input: CreateTimeBlockInput,
  ): Promise<CreateTimeBlockResult>;
  cancelBlock(salonId: string, userId: string, blockId: string): Promise<TimeBlock>;
};
