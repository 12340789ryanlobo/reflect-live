// Survey domain types — shared between worker (scheduler/sender) and web
// (Twilio inbound webhook). Mirrors reflect's models.py + survey_v0.yaml.

export type SessionType = 'practice' | 'match' | 'lifting';

export type DeliveryStatus = 'pending' | 'in_progress' | 'completed' | 'abandoned';

export type FlagType = 'low_readiness' | 'high_pain' | 'injury_concern' | 'custom';

export type FlagSeverity = 'low' | 'medium' | 'high';

export type QuestionType =
  | 'scale_1_10'
  | 'binary'
  | 'choice_1_3'
  | 'captain_rating'
  | 'multi_select_body_regions'
  | 'free_text';

export interface QuestionValidation {
  min?: number;
  max?: number;
  required?: boolean;
  max_length?: number;
}

export interface QuestionFlagRule {
  condition: string;          // e.g. "value <= 3", "value == 1", "value >= 7"
  flag_type: FlagType;
  severity?: FlagSeverity;
}

export interface QuestionConditional {
  depends_on: string;         // question id
  show_if: string;            // e.g. "value == 1"
}

export interface SurveyQuestion {
  id: string;
  order: number;
  text: string;
  type: QuestionType;
  session_types?: SessionType[];
  team_codes?: string[];
  captain_only?: boolean;
  validation?: QuestionValidation;
  flag_rule?: QuestionFlagRule;
  conditional?: QuestionConditional;
  ack_on_yes?: string;
}

export interface SurveyConfig {
  version: string;
  name: string;
  estimated_time_minutes?: number;
  questions: SurveyQuestion[];
  completion_messages?: string[];
  completion_message?: string;        // legacy single string
  error_messages?: Record<string, string>;
}

export interface SessionRow {
  id: number;
  team_id: number;
  type: SessionType;
  label: string;
  template_id: number | null;
  video_links_json: unknown;
  metadata_json: SessionMetadata | null;
  created_at: string;
  deleted_at: string | null;
}

export interface SessionMetadata {
  question_snapshot?: {
    version: number;
    source: 'yaml' | 'template';
    template_id: number | null;
    session_type: SessionType;
    team_code: string | null;
    captured_at: string;
    questions: SurveyQuestion[];
  };
  [k: string]: unknown;
}

export interface DeliveryRow {
  id: number;
  session_id: number;
  player_id: number;
  status: DeliveryStatus;
  started_at: string | null;
  completed_at: string | null;
  current_q_idx: number;
  reminder_sent_at: string | null;
  session_type: SessionType | null;
  created_at: string;
}

export interface ResponseRow {
  id: number;
  session_id: number;
  player_id: number;
  question_id: string;
  answer_raw: string;
  answer_num: number | null;
  created_at: string;
}

export interface FlagRow {
  id: number;
  session_id: number;
  player_id: number;
  flag_type: FlagType;
  severity: FlagSeverity;
  details: string | null;
  created_at: string;
}

export interface ScheduledSendRow {
  id: number;
  session_id: number;
  scheduled_at: string;
  group_filter: string | null;
  player_ids_json: unknown;
  channel: 'whatsapp' | 'sms';
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  processing_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface QuestionTemplateRow {
  id: number;
  team_id: number;
  name: string;
  session_type: SessionType;
  questions_json: SurveyQuestion[];
  is_default: boolean;
  created_at: string;
}
