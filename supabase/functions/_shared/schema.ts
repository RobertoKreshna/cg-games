import {
  pgTable, pgEnum, uuid, varchar, text, integer,
  boolean, timestamp, jsonb, unique,
} from 'npm:drizzle-orm/pg-core'

export const gameTypeEnum = pgEnum('game_type', ['bible_quiz', 'verse_scramble', 'emoji_story'])
export const roomModeEnum = pgEnum('room_mode', ['individual', 'team'])
export const roomStatusEnum = pgEnum('room_status', ['lobby', 'playing', 'finished'])
export const sessionStatusEnum = pgEnum('session_status', ['waiting', 'question', 'reveal', 'finished'])

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 6 }).notNull().unique(),
  gameType: gameTypeEnum('game_type').notNull(),
  mode: roomModeEnum('mode').notNull().default('individual'),
  questionCount: integer('question_count').notNull().default(10),
  status: roomStatusEnum('status').notNull().default('lobby'),
  hostToken: varchar('host_token', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(),
  color: varchar('color', { length: 20 }).notNull(),
})

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
  sessionToken: varchar('session_token', { length: 64 }).notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
})

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameType: gameTypeEnum('game_type').notNull(),
  orderIndex: integer('order_index').notNull(),
  content: jsonb('content').notNull(),
})

export const gameSessions = pgTable('game_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  currentQuestionIndex: integer('current_question_index').notNull().default(0),
  questionIds: jsonb('question_ids'),
  status: sessionStatusEnum('status').notNull().default('waiting'),
  startedAt: timestamp('started_at', { withTimezone: true }),
})

export const answers = pgTable('answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
  submittedAnswer: text('submitted_answer').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  points: integer('points').notNull().default(0),
  timeTakenMs: integer('time_taken_ms').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniquePlayerQuestion: unique().on(t.playerId, t.questionId, t.sessionId),
}))
