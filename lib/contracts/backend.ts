import { z } from "zod";
export const uuid = z.string().uuid();
export const loginSchema = z
  .object({ email: z.email().max(254), password: z.string().min(1).max(1024) })
  .strict();
export const submitIncidentSchema = z
  .object({
    organizationId: uuid,
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(15).max(2000),
    category: z.enum([
      "blockage",
      "flooding",
      "debris",
      "damaged_culvert",
      "other",
    ]),
    longitude: z.number().finite().min(-0.45).max(0.1),
    latitude: z.number().finite().min(5.4).max(5.85),
  })
  .strict();
export const editIncidentSchema = submitIncidentSchema.omit({
  organizationId: true,
});
export const emptySchema = z.object({}).strict();
export const transitionSchema = z
  .object({
    status: z.enum([
      "under_review",
      "verified",
      "assigned",
      "in_progress",
      "resolved",
      "rejected",
    ]),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.status === "rejected" &&
      (!value.reason || value.reason.length < 5)
    )
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A rejection reason of at least five characters is required.",
      });
  });
export const workOrderSchema = z
  .object({
    incidentId: uuid,
    title: z.string().trim().min(5).max(160),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();
export const dueDateSchema = z
  .object({ dueDate: z.iso.date().nullable() })
  .strict();
export const assignmentSchema = z.object({ userId: uuid }).strict();
export const completionSchema = z
  .object({ notes: z.string().trim().min(5).max(2000) })
  .strict();
export const membershipSchema = z
  .object({
    organizationId: uuid,
    userId: uuid,
    role: z.enum(["resident", "moderator", "operator", "admin"]),
  })
  .strict();
export const deactivateMembershipSchema = z
  .object({ organizationId: uuid })
  .strict();
