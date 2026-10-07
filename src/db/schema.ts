import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiPrincipals = pgTable(
  "api_principals",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("api_principals_key_hash_uq").on(table.keyHash)],
);

export const vendors = pgTable("vendors", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  normalMaxAmountCents: integer("normal_max_amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vendorDestinations = pgTable("vendor_destinations", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id")
    .notNull()
    .references(() => vendors.id),
  destination: text("destination").notNull(),
  trusted: boolean("trusted").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const policies = pgTable("policies", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  autoPayMaxAmountCents: integer("auto_pay_max_amount_cents").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentRequests = pgTable("payment_requests", {
  id: text("id").primaryKey(),
  logicalPaymentId: text("logical_payment_id").notNull().unique(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  vendorId: text("vendor_id")
    .notNull()
    .references(() => vendors.id),
  invoiceNumber: text("invoice_number").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  requestedDestination: text("requested_destination").notNull(),
  status: text("status").notNull(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentDecisions = pgTable(
  "payment_decisions",
  {
    id: text("id").primaryKey(),
    paymentRequestId: text("payment_request_id")
      .notNull()
      .references(() => paymentRequests.id),
    outcome: text("outcome").notNull(),
    reasonCodes: jsonb("reason_codes").$type<string[]>().notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>[]>().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("payment_decisions_request_uq").on(table.paymentRequestId)],
);
