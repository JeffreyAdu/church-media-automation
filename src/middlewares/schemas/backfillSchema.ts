/**
 * Backfill Validation Schema
 * Zod schema for validating backfill requests.
 */

import { z } from "zod";

export const backfillSchema = z.object({
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .refine(
      (date) => {
        const parsed = new Date(date);
        return !isNaN(parsed.getTime()) && parsed <= new Date();
      },
      { message: "Date must be valid and not in the future" }
    ),
});
