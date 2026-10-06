import { call } from "@argentic/chest-app/client";

// The settings' actions, as the settings' islands ask them: each answers
// call()'s outcome without a toast of its own (the island says a refusal
// and what was saved, src/islands/Settings.tsx), then the page refreshes.
const quiet = { quiet: true } as const;

export const setVehicle = (input: { kind: string; power: string; electric: boolean }) => call("setVehicle", input, quiet);
export const setPriorDistance = (year: number, distance: string) => call("setPriorDistance", { year, distance }, quiet);
export const setVehicleProof = (object: string | null, name?: string) => call("setVehicleProof", { object, ...(name !== undefined ? { name } : {}) }, quiet);
export const checkVehicle = (member: string, checked: boolean) => call("checkVehicle", { member, checked }, quiet);
export const updateCompany = (input: { currency?: string; reminder?: boolean; journal?: Record<string, string>; payer?: string; bankLocale?: string }) => call("updateCompany", { input }, quiet);
export const addCategory = (input: { name: string }) => call("addCategory", { input }, quiet);
export const updateCategory = (id: string, input: { name?: string; account?: string; vatRecovery?: number; cap?: string | null; archived?: boolean; guests?: boolean; perNight?: boolean }) => call("updateCategory", { id, input }, quiet);
export const setMemberAccount = (member: string, account: string) => call("setMemberAccount", { member, account }, quiet);
export const setApprover = (member: string, approver: string | null) => call("setApprover", { member, approver }, quiet);
export const addCardRule = (words: string, categoryId: string) => call("addCardRule", { words, categoryId }, quiet);
export const removeCardRule = (id: string) => call("removeCardRule", { id }, quiet);
export const saveAllowanceRate = (id: string | null, input: { name?: string; amount?: string; unit?: string; account?: string; archived?: boolean }) => call("saveAllowanceRate", { id, input }, quiet);
export const setRate = (currency: string, rate: string) => call("setRate", { currency, rate }, quiet);
export const saveScale = (year: number, data: unknown, source: string) => call("saveScale", { year, data, source }, quiet);
export const confirmBank = () => call("confirmBank", {}, quiet);
