export type OrganizationReport = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  longitude: number;
  latitude: number;
  created_at: string;
};
export type OrganizationMembership = {
  organization_id: string;
  role: string;
  organizations: { id: string; name: string } | null;
};
export const reportStatus = (status: string) =>
  status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
