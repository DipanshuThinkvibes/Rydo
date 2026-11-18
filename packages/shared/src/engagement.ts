import { z } from 'zod';

/**
 * Shared rules for issue reports, chat, feedback, surveys, announcements, push devices and safety contacts.
 * Everything here is free to use: no payment or pricing fields exist in these APIs.
 */
const uuid = z.string().uuid();
const limit = z.coerce.number().int().min(1).max(100).default(30);

// ---------- Issue reports ----------
export const ISSUE_CATEGORIES = ['UNSAFE_DRIVING', 'HARASSMENT', 'LATE_OR_NO_SHOW', 'ROUTE', 'COST', 'APP_BUG', 'OTHER'] as const;
export const ISSUE_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
export type IssueCategoryName = (typeof ISSUE_CATEGORIES)[number];
export type IssueStatusName = (typeof ISSUE_STATUSES)[number];

export const issueCreateSchema = z.object({
  category: z.enum(ISSUE_CATEGORIES),
  description: z.string().trim().min(10, 'Tell us a little more (at least 10 characters)').max(2000),
  rideId: uuid.optional(),
  againstMembershipId: uuid.optional(),
});
export type IssueCreate = z.infer<typeof issueCreateSchema>;

export const issueUpdateSchema = z
  .object({
    status: z.enum(ISSUE_STATUSES).optional(),
    resolution: z.string().trim().min(1).max(2000).optional(),
    assignToMe: z.boolean().optional(),
  })
  .refine((v) => v.status !== undefined || v.resolution !== undefined || v.assignToMe !== undefined, { message: 'Nothing to change' });
export type IssueUpdate = z.infer<typeof issueUpdateSchema>;

export const issueQuerySchema = z.object({
  status: z.enum(ISSUE_STATUSES).optional(),
  category: z.enum(ISSUE_CATEGORIES).optional(),
  cursor: z.string().max(100).optional(),
  limit,
});
export type IssueQuery = z.infer<typeof issueQuerySchema>;

// ---------- Chat (one driver, one confirmed rider, one ride) ----------
export const chatMessageSchema = z.object({ body: z.string().trim().min(1, 'Write a message').max(1000) });
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

export const chatHistorySchema = z.object({ before: z.string().datetime().optional(), limit });
export type ChatHistoryQuery = z.infer<typeof chatHistorySchema>;

/** Socket.IO events sent to room chat:<rideId>:<riderMembershipId>. */
export const CHAT_EVENT = 'chat.message';
export const CHAT_READ_EVENT = 'chat.read';
export const chatRoom = (rideId: string, riderMembershipId: string) => `chat:${rideId}:${riderMembershipId}`;

// ---------- Feedback form ----------
export const FEEDBACK_CATEGORIES = ['USABILITY', 'MATCHING', 'COMMUNICATION', 'COST_SHARING', 'GENERAL'] as const;
export const FEEDBACK_STATUSES = ['NEW', 'REVIEWED', 'CLOSED'] as const;
export type FeedbackCategoryName = (typeof FEEDBACK_CATEGORIES)[number];

export const feedbackCreateSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().min(3, 'Write a few words').max(1000),
});
export type FeedbackCreate = z.infer<typeof feedbackCreateSchema>;

export const feedbackUpdateSchema = z
  .object({ status: z.enum(FEEDBACK_STATUSES).optional(), adminNote: z.string().trim().max(1000).optional() })
  .refine((v) => v.status !== undefined || v.adminNote !== undefined, { message: 'Nothing to change' });
export type FeedbackUpdate = z.infer<typeof feedbackUpdateSchema>;

export const feedbackQuerySchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  cursor: z.string().max(100).optional(),
  limit,
});
export type FeedbackQuery = z.infer<typeof feedbackQuerySchema>;

/** Days of history for the insights dashboard. */
export const insightsQuerySchema = z.object({ days: z.coerce.number().int().min(7).max(365).default(90) });

// ---------- Who gets a survey or an announcement ----------
export const audienceSchema = z.object({
  roles: z.array(z.enum(['RIDER', 'DRIVER'])).max(2).optional(),
  departmentIds: z.array(uuid).max(50).optional(),
});
export type Audience = z.infer<typeof audienceSchema>;

// ---------- Surveys ----------
export const surveyQuestionSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string().regex(/^[a-z0-9_]{1,30}$/), type: z.literal('RATING'), text: z.string().trim().min(3).max(300) }),
  z.object({ id: z.string().regex(/^[a-z0-9_]{1,30}$/), type: z.literal('CHOICE'), text: z.string().trim().min(3).max(300), options: z.array(z.string().trim().min(1).max(100)).min(2).max(10) }),
  z.object({ id: z.string().regex(/^[a-z0-9_]{1,30}$/), type: z.literal('TEXT'), text: z.string().trim().min(3).max(300) }),
]);
export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;

export const surveyCreateSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(1000).optional(),
  questions: z.array(surveyQuestionSchema).min(1).max(20),
  audience: audienceSchema.default({}),
  closesAt: z.string().datetime().optional(),
});
export type SurveyCreate = z.infer<typeof surveyCreateSchema>;

/** question id -> a number (RATING), the chosen option (CHOICE) or free text (TEXT). */
export const surveyAnswersSchema = z.object({ answers: z.record(z.string(), z.union([z.number(), z.string().max(2000)])) });
export type SurveyAnswers = z.infer<typeof surveyAnswersSchema>;

// ---------- Announcements (admin push to everyone or a segment) ----------
export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(1000),
  audience: audienceSchema.default({}),
  email: z.boolean().default(false),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;

// ---------- Push devices (the mobile app registers its token after sign-in) ----------
export const deviceSchema = z.object({ token: z.string().min(10).max(4096), platform: z.enum(['IOS', 'ANDROID']) });
export type DeviceInput = z.infer<typeof deviceSchema>;

// ---------- Safety ----------
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number');
export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone,
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  relation: z.string().trim().max(60).optional(),
});
export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;
export const MAX_EMERGENCY_CONTACTS = 5;

export const blockSchema = z.object({ membershipId: uuid });
export type BlockInput = z.infer<typeof blockSchema>;

/** Email the live trip link to chosen emergency contacts (they need an email on file). */
export const shareToContactsSchema = z.object({ contactIds: z.array(uuid).min(1).max(MAX_EMERGENCY_CONTACTS) });
export type ShareToContacts = z.infer<typeof shareToContactsSchema>;

// ---------- Profile photo ----------
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const photoUploadSchema = z.object({ contentType: z.enum(PHOTO_TYPES) });
export const photoConfirmSchema = z.object({ key: z.string().min(10).max(300) });
