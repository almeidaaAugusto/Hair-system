import { z } from "zod";

export const createServiceSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do serviço.").max(120),
  durationMinutes: z
    .number()
    .int("A duração deve ser um número inteiro de minutos.")
    .min(1, "A duração deve ser maior que zero.")
    .max(1_440, "A duração não pode ultrapassar 1.440 minutos."),
  startingPriceCents: z
    .number()
    .int("O preço deve ser informado em centavos inteiros.")
    .min(0, "O preço inicial não pode ser negativo.")
    .max(10_000_000, "O preço inicial informado é inválido."),
  hasVariablePrice: z.boolean(),
  requiresEvaluation: z.boolean(),
  isActive: z.boolean(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export type Service = CreateServiceInput & {
  id: string;
  salonId: string;
};
