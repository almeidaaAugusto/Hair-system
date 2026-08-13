import {
  createServiceSchema,
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

export type { CreateServiceInput };
