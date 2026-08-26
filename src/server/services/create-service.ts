import {
  createServiceSchema,
  updateServiceSchema,
  type CreateServiceInput,
  type Service,
} from "@/domain/services/service";
import type { AdminContext } from "@/server/auth/admin-context";
import type { ServicesRepository } from "@/server/services/service-repository";

export async function createService(
  input: unknown,
  admin: AdminContext,
  repository: ServicesRepository,
): Promise<Service> {
  const service = createServiceSchema.parse(input);
  return repository.create(admin.salonId, service);
}

export function listServices(
  admin: AdminContext,
  repository: ServicesRepository,
): Promise<Service[]> {
  return repository.list(admin.salonId);
}

export async function updateService(
  serviceId: string,
  input: unknown,
  admin: AdminContext,
  repository: ServicesRepository,
): Promise<Service> {
  const service = updateServiceSchema.parse(input);
  return repository.update(admin.salonId, serviceId, service);
}

export type { CreateServiceInput };
