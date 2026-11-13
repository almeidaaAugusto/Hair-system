"use client";

import type { UseFormRegister } from "react-hook-form";

import type { ClientFormFields } from "./client-form";

/** Inputs shared by the "new client" form and the client record editor. */
export function ClientFieldsInputs({ register }: { register: UseFormRegister<ClientFormFields> }) {
  return (
    <>
      <div className="agenda-form-grid">
        <label>
          Nome
          <input autoComplete="off" maxLength={120} required {...register("name")} />
        </label>
        <label>
          Telefone (WhatsApp)
          <input
            autoComplete="off"
            inputMode="tel"
            placeholder="(11) 99999-9999"
            required
            {...register("phone")}
          />
        </label>
      </div>
      <label>
        Instagram (opcional)
        <input
          autoCapitalize="none"
          autoComplete="off"
          maxLength={31}
          placeholder="@usuario"
          {...register("instagram")}
        />
      </label>
      <fieldset className="client-birthday">
        <legend>Aniversário (opcional)</legend>
        <label>
          Dia
          <input inputMode="numeric" maxLength={2} placeholder="DD" {...register("birthDay")} />
        </label>
        <label>
          Mês
          <input inputMode="numeric" maxLength={2} placeholder="MM" {...register("birthMonth")} />
        </label>
        <label>
          Ano (opcional)
          <input inputMode="numeric" maxLength={4} placeholder="AAAA" {...register("birthYear")} />
        </label>
      </fieldset>
      <label>
        Observações
        <textarea maxLength={2000} rows={4} {...register("notes")} />
      </label>
    </>
  );
}
