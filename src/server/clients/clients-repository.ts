import type {
  ChemicalEntry,
  ChemicalEntryInput,
  ClientListItem,
  ClientRecord,
  CreateClientInput,
  UpdateClientInput,
} from "@/domain/clients/client";

export type CreateClientResult = { client: ClientRecord; replayed: boolean };
export type AddChemicalEntryResult = {
  client: ClientRecord;
  entry: ChemicalEntry;
  replayed: boolean;
};

export type ClientsRepository = {
  list(salonId: string): Promise<ClientListItem[]>;
  /** Finds the client owning this phone (any format); null when there is none. */
  findByPhone(salonId: string, phone: string): Promise<ClientRecord | null>;
  get(salonId: string, clientId: string): Promise<ClientRecord>;
  create(salonId: string, userId: string, input: CreateClientInput): Promise<CreateClientResult>;
  update(
    salonId: string,
    userId: string,
    clientId: string,
    input: UpdateClientInput,
  ): Promise<ClientRecord>;
  addChemicalEntry(
    salonId: string,
    userId: string,
    clientId: string,
    input: ChemicalEntryInput,
  ): Promise<AddChemicalEntryResult>;
  removeChemicalEntry(
    salonId: string,
    userId: string,
    clientId: string,
    entryId: string,
  ): Promise<ClientRecord>;
};
