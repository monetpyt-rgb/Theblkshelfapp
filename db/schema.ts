import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const readerFavoriteAuthors = sqliteTable("reader_favorite_authors", {
  userId: text("user_id").notNull(),
  authorId: text("author_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.authorId] })]);

export const readerDismissedReleases = sqliteTable("reader_dismissed_releases", {
  userId: text("user_id").notNull(),
  bookId: text("book_id").notNull(),
  dismissedAt: text("dismissed_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.bookId] })]);

export const readerShelves = sqliteTable(
  "reader_shelves",
  {
    userId: text("user_id").notNull(),
    bookId: text("book_id").notNull(),
    status: text("status").notNull(),
    favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.bookId] })],
);

export const readerProfiles = sqliteTable("reader_profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const readerReviews = sqliteTable("reader_reviews", {
  userId: text("user_id").notNull(),
  bookId: text("book_id").notNull(),
  id: text("id").notNull(),
  rating: integer("rating").notNull(),
  review: text("review").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.bookId] }), index("idx_reader_reviews_book_updated").on(table.bookId, table.updatedAt)]);
