import {
  BUSINESS_HOURS_TIME_ZONE,
  DEFAULT_PROFESSIONAL_ID,
  businessHoursInputSchema,
  createDefaultBusinessHoursInput,
  type BusinessHours,
} from "@/domain/business-hours/business-hours";
import type { AdminContext } from "@/server/auth/admin-context";
import type { BusinessHoursRepository } from "@/server/business-hours/business-hours-repository";

export async function getBusinessHoursConfiguration(
  admin: AdminContext,
  repository: BusinessHoursRepository,
): Promise<BusinessHours> {
  const configuration = await repository.get(admin.salonId, DEFAULT_PROFESSIONAL_ID);
  if (configuration) {
    return configuration;
  }

  return {
    ...createDefaultBusinessHoursInput(),
    salonId: admin.salonId,
    professionalId: DEFAULT_PROFESSIONAL_ID,
    timezone: BUSINESS_HOURS_TIME_ZONE,
  };
}

export async function updateBusinessHours(
  input: unknown,
  admin: AdminContext,
  repository: BusinessHoursRepository,
): Promise<BusinessHours> {
  const configuration = businessHoursInputSchema.parse(input);
  return repository.save(admin.salonId, DEFAULT_PROFESSIONAL_ID, configuration);
}
