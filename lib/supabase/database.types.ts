// Generated from Supabase project yigqsjevwvqxrxvqhvtd on 2026-10-06 UTC (20 migrations). Regenerate after migrations.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      amazon_campaign_plans: {
        Row: {
          approval_notes: string | null
          created_at: string
          id: string
          marketing_profile_id: string
          organization_id: string | null
          owner_id: string | null
          plan: Json
          sku: string
          status: string
          updated_at: string
        }
        Insert: {
          approval_notes?: string | null
          created_at?: string
          id?: string
          marketing_profile_id: string
          organization_id?: string | null
          owner_id?: string | null
          plan?: Json
          sku: string
          status?: string
          updated_at?: string
        }
        Update: {
          approval_notes?: string | null
          created_at?: string
          id?: string
          marketing_profile_id?: string
          organization_id?: string | null
          owner_id?: string | null
          plan?: Json
          sku?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "amazon_campaign_plans_marketing_profile_id_fkey"
            columns: ["marketing_profile_id"]
            isOneToOne: true
            referencedRelation: "product_marketing_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_profile_scope"
            columns: ["marketing_profile_id", "organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "product_marketing_profiles"
            referencedColumns: ["id", "organization_id", "owner_id"]
          },
        ]
      }
      catalog_ai_operations: {
        Row: {
          action: string
          created_at: string
          day: string
          estimated_usd_micro: number | null
          id: string
          organization_id: string
          owner_id: string
          pricing: Json | null
          reserved_usd_micro: number
          sku: string
          status: string
          updated_at: string
          usage: Json
        }
        Insert: {
          action: string
          created_at?: string
          day?: string
          estimated_usd_micro?: number | null
          id?: string
          organization_id: string
          owner_id: string
          pricing?: Json | null
          reserved_usd_micro?: number
          sku: string
          status?: string
          updated_at?: string
          usage?: Json
        }
        Update: {
          action?: string
          created_at?: string
          day?: string
          estimated_usd_micro?: number | null
          id?: string
          organization_id?: string
          owner_id?: string
          pricing?: Json | null
          reserved_usd_micro?: number
          sku?: string
          status?: string
          updated_at?: string
          usage?: Json
        }
        Relationships: []
      }
      catalog_assets: {
        Row: {
          byte_size: number
          created_at: string
          filename: string
          id: string
          mime_type: string
          object_path: string
          organization_id: string
          owner_id: string
          prelisting_id: string
          purpose: string
          scan_checked_at: string | null
          scan_receipt: Json | null
          scan_status: string
          sha256: string
          sku: string
          status: string
          updated_at: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          filename: string
          id: string
          mime_type: string
          object_path: string
          organization_id: string
          owner_id: string
          prelisting_id: string
          purpose: string
          scan_checked_at?: string | null
          scan_receipt?: Json | null
          scan_status?: string
          sha256: string
          sku: string
          status?: string
          updated_at?: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string
          object_path?: string
          organization_id?: string
          owner_id?: string
          prelisting_id?: string
          purpose?: string
          scan_checked_at?: string | null
          scan_receipt?: Json | null
          scan_status?: string
          sha256?: string
          sku?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_assets_prelisting_id_organization_id_owner_id_fkey"
            columns: ["prelisting_id", "organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "prelistings"
            referencedColumns: ["id", "organization_id", "owner_id"]
          },
        ]
      }
      catalog_events: {
        Row: {
          attempts: number
          created_at: string
          error_code: string | null
          event_time: string
          id: string
          lease_token: string | null
          lease_until: string | null
          notification_id: string
          notification_type: string
          organization_id: string
          owner_id: string
          payload: Json
          payload_hash: string
          prelisting_id: string
          provider: string
          sku: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_code?: string | null
          event_time: string
          id: string
          lease_token?: string | null
          lease_until?: string | null
          notification_id: string
          notification_type: string
          organization_id: string
          owner_id: string
          payload: Json
          payload_hash: string
          prelisting_id: string
          provider: string
          sku: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_code?: string | null
          event_time?: string
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          notification_id?: string
          notification_type?: string
          organization_id?: string
          owner_id?: string
          payload?: Json
          payload_hash?: string
          prelisting_id?: string
          provider?: string
          sku?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_events_prelisting_id_organization_id_owner_id_fkey"
            columns: ["prelisting_id", "organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "prelistings"
            referencedColumns: ["id", "organization_id", "owner_id"]
          },
        ]
      }
      catalog_feeds: {
        Row: {
          attempt_no: number
          created_at: string
          document_id: string | null
          feed_id: string | null
          id: string
          lease_token: string | null
          lease_until: string | null
          manifest: Json
          manifest_hash: string
          organization_id: string
          owner_id: string
          payload: Json
          processing_status: string | null
          report: Json | null
          result_document_id: string | null
          retry_of: string | null
          status: string
          target: Json
          updated_at: string
        }
        Insert: {
          attempt_no?: number
          created_at?: string
          document_id?: string | null
          feed_id?: string | null
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          manifest: Json
          manifest_hash: string
          organization_id: string
          owner_id: string
          payload: Json
          processing_status?: string | null
          report?: Json | null
          result_document_id?: string | null
          retry_of?: string | null
          status?: string
          target: Json
          updated_at?: string
        }
        Update: {
          attempt_no?: number
          created_at?: string
          document_id?: string | null
          feed_id?: string | null
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          manifest?: Json
          manifest_hash?: string
          organization_id?: string
          owner_id?: string
          payload?: Json
          processing_status?: string | null
          report?: Json | null
          result_document_id?: string | null
          retry_of?: string | null
          status?: string
          target?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_feeds_retry_of_fkey"
            columns: ["retry_of"]
            isOneToOne: false
            referencedRelation: "catalog_feeds"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_jobs: {
        Row: {
          attempts: number
          created_at: string
          cursor: number
          id: string
          idempotency_key: string
          kind: string
          lease_token: string | null
          lease_until: string | null
          next_attempt_at: string
          organization_id: string
          owner_id: string
          payload: Json
          results: Json
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          cursor?: number
          id?: string
          idempotency_key: string
          kind: string
          lease_token?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          organization_id: string
          owner_id: string
          payload: Json
          results?: Json
          status?: string
          total: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          cursor?: number
          id?: string
          idempotency_key?: string
          kind?: string
          lease_token?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          organization_id?: string
          owner_id?: string
          payload?: Json
          results?: Json
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      catalog_submissions: {
        Row: {
          attempt_no: number
          channel: string
          created_at: string
          feed_batch_id: string | null
          id: string
          organization_id: string
          owner_id: string
          request_hash: string
          request_payload: Json | null
          response: Json | null
          sku: string
          status: string
          target: Json | null
          updated_at: string
        }
        Insert: {
          attempt_no?: number
          channel: string
          created_at?: string
          feed_batch_id?: string | null
          id?: string
          organization_id: string
          owner_id: string
          request_hash: string
          request_payload?: Json | null
          response?: Json | null
          sku: string
          status: string
          target?: Json | null
          updated_at?: string
        }
        Update: {
          attempt_no?: number
          channel?: string
          created_at?: string
          feed_batch_id?: string | null
          id?: string
          organization_id?: string
          owner_id?: string
          request_hash?: string
          request_payload?: Json | null
          response?: Json | null
          sku?: string
          status?: string
          target?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_submissions_feed_batch_id_fkey"
            columns: ["feed_batch_id"]
            isOneToOne: false
            referencedRelation: "catalog_feeds"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_versions: {
        Row: {
          created_at: string
          fingerprint: string
          id: string
          organization_id: string
          owner_id: string
          prelisting_id: string
          sku: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id?: string
          organization_id: string
          owner_id: string
          prelisting_id: string
          sku: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          organization_id?: string
          owner_id?: string
          prelisting_id?: string
          sku?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "catalog_versions_prelisting_id_fkey"
            columns: ["prelisting_id"]
            isOneToOne: false
            referencedRelation: "prelistings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_approvals: {
        Row: {
          approver: string
          comments: string
          content_hash: string | null
          created_at: string
          decision: string
          id: string
          marketing_profile_id: string
          organization_id: string | null
          owner_id: string | null
          signature: string | null
          sku: string
          snapshot: Json | null
        }
        Insert: {
          approver: string
          comments: string
          content_hash?: string | null
          created_at?: string
          decision: string
          id?: string
          marketing_profile_id: string
          organization_id?: string | null
          owner_id?: string | null
          signature?: string | null
          sku: string
          snapshot?: Json | null
        }
        Update: {
          approver?: string
          comments?: string
          content_hash?: string | null
          created_at?: string
          decision?: string
          id?: string
          marketing_profile_id?: string
          organization_id?: string | null
          owner_id?: string | null
          signature?: string | null
          sku?: string
          snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_approvals_marketing_profile_id_fkey"
            columns: ["marketing_profile_id"]
            isOneToOne: false
            referencedRelation: "product_marketing_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_profile_scope"
            columns: ["marketing_profile_id", "organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "product_marketing_profiles"
            referencedColumns: ["id", "organization_id", "owner_id"]
          },
        ]
      }
      marketing_tasks: {
        Row: {
          agent: string
          created_at: string
          id: string
          idempotency_key: string | null
          kanban_task_id: string | null
          marketing_profile_id: string
          organization_id: string | null
          owner_id: string | null
          payload: Json
          sku: string
          status: string
          task_type: string
          updated_at: string
        }
        Insert: {
          agent: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          kanban_task_id?: string | null
          marketing_profile_id: string
          organization_id?: string | null
          owner_id?: string | null
          payload?: Json
          sku: string
          status?: string
          task_type: string
          updated_at?: string
        }
        Update: {
          agent?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          kanban_task_id?: string | null
          marketing_profile_id?: string
          organization_id?: string | null
          owner_id?: string | null
          payload?: Json
          sku?: string
          status?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_profile_scope"
            columns: ["marketing_profile_id", "organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "product_marketing_profiles"
            referencedColumns: ["id", "organization_id", "owner_id"]
          },
          {
            foreignKeyName: "marketing_tasks_marketing_profile_id_fkey"
            columns: ["marketing_profile_id"]
            isOneToOne: false
            referencedRelation: "product_marketing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaign_plans: {
        Row: {
          approval_notes: string | null
          created_at: string
          id: string
          marketing_profile_id: string
          organization_id: string | null
          owner_id: string | null
          plan: Json
          sku: string
          status: string
          updated_at: string
        }
        Insert: {
          approval_notes?: string | null
          created_at?: string
          id?: string
          marketing_profile_id: string
          organization_id?: string | null
          owner_id?: string | null
          plan?: Json
          sku: string
          status?: string
          updated_at?: string
        }
        Update: {
          approval_notes?: string | null
          created_at?: string
          id?: string
          marketing_profile_id?: string
          organization_id?: string | null
          owner_id?: string | null
          plan?: Json
          sku?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_profile_scope"
            columns: ["marketing_profile_id", "organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "product_marketing_profiles"
            referencedColumns: ["id", "organization_id", "owner_id"]
          },
          {
            foreignKeyName: "meta_campaign_plans_marketing_profile_id_fkey"
            columns: ["marketing_profile_id"]
            isOneToOne: true
            referencedRelation: "product_marketing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prelistings: {
        Row: {
          archived_at: string | null
          brand: string
          created_at: string
          human_reviewed: boolean
          id: string
          organization_id: string | null
          owner_id: string | null
          payload: Json
          sku: string
          source_platform: string | null
          source_snapshot: Json | null
          source_url: string | null
          status: string
          submission: Json
          template_key: string | null
          template_version: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          brand?: string
          created_at?: string
          human_reviewed?: boolean
          id?: string
          organization_id?: string | null
          owner_id?: string | null
          payload?: Json
          sku: string
          source_platform?: string | null
          source_snapshot?: Json | null
          source_url?: string | null
          status?: string
          submission?: Json
          template_key?: string | null
          template_version?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          brand?: string
          created_at?: string
          human_reviewed?: boolean
          id?: string
          organization_id?: string | null
          owner_id?: string | null
          payload?: Json
          sku?: string
          source_platform?: string | null
          source_snapshot?: Json | null
          source_url?: string | null
          status?: string
          submission?: Json
          template_key?: string | null
          template_version?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_marketing_profiles: {
        Row: {
          approval_notes: string | null
          approved_claims: Json
          audience: Json
          created_at: string
          economics: Json
          id: string
          objections: Json
          objective: string | null
          organization_id: string | null
          owner_id: string | null
          prelisting_id: string | null
          prohibited_claims: Json
          purchase_motivations: Json
          sku: string
          source_provenance: Json
          status: string
          updated_at: string
        }
        Insert: {
          approval_notes?: string | null
          approved_claims?: Json
          audience?: Json
          created_at?: string
          economics?: Json
          id?: string
          objections?: Json
          objective?: string | null
          organization_id?: string | null
          owner_id?: string | null
          prelisting_id?: string | null
          prohibited_claims?: Json
          purchase_motivations?: Json
          sku: string
          source_provenance?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          approval_notes?: string | null
          approved_claims?: Json
          audience?: Json
          created_at?: string
          economics?: Json
          id?: string
          objections?: Json
          objective?: string | null
          organization_id?: string | null
          owner_id?: string | null
          prelisting_id?: string | null
          prohibited_claims?: Json
          purchase_motivations?: Json
          sku?: string
          source_provenance?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_profile_catalog_scope"
            columns: ["prelisting_id", "organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "prelistings"
            referencedColumns: ["id", "organization_id", "owner_id"]
          },
          {
            foreignKeyName: "product_marketing_profiles_prelisting_id_fkey"
            columns: ["prelisting_id"]
            isOneToOne: false
            referencedRelation: "prelistings"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_plans: {
        Row: {
          attribution_status: string
          attribution_tag: string | null
          created_at: string
          destination_url: string | null
          events: Json
          id: string
          marketing_profile_id: string
          notes: string | null
          organization_id: string | null
          owner_id: string | null
          sku: string
          status: string
          updated_at: string
          utm_rules: Json
        }
        Insert: {
          attribution_status?: string
          attribution_tag?: string | null
          created_at?: string
          destination_url?: string | null
          events?: Json
          id?: string
          marketing_profile_id: string
          notes?: string | null
          organization_id?: string | null
          owner_id?: string | null
          sku: string
          status?: string
          updated_at?: string
          utm_rules?: Json
        }
        Update: {
          attribution_status?: string
          attribution_tag?: string | null
          created_at?: string
          destination_url?: string | null
          events?: Json
          id?: string
          marketing_profile_id?: string
          notes?: string | null
          organization_id?: string | null
          owner_id?: string | null
          sku?: string
          status?: string
          updated_at?: string
          utm_rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "marketing_profile_scope"
            columns: ["marketing_profile_id", "organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "product_marketing_profiles"
            referencedColumns: ["id", "organization_id", "owner_id"]
          },
          {
            foreignKeyName: "tracking_plans_marketing_profile_id_fkey"
            columns: ["marketing_profile_id"]
            isOneToOne: true
            referencedRelation: "product_marketing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      prelisting_session_active: { Args: never; Returns: boolean }
      record_catalog_feed_outcome: {
        Args: {
          p_batch: string
          p_expected_version: string
          p_hash: string
          p_lease: string
          p_organization: string
          p_owner: string
          p_response: Json
          p_sku: string
          p_status: string
          p_submission: Json
        }
        Returns: Json
      }
      record_marketing_approval: {
        Args: {
          p_organization: string
          p_owner: string
          p_profile: string
          p_record: Json
          p_sku: string
          p_snapshot: Json
          p_versions: Json
        }
        Returns: string
      }
      reserve_catalog_ai_operation: {
        Args: {
          p_action: string
          p_limit: number
          p_organization: string
          p_owner: string
          p_sku: string
        }
        Returns: string
      }
      reserve_catalog_ai_operation_cost: {
        Args: {
          p_action: string
          p_daily_usd_micro: number
          p_limit: number
          p_organization: string
          p_owner: string
          p_pricing: Json
          p_reserved_usd_micro: number
          p_sku: string
        }
        Returns: string
      }
      reserve_catalog_channel_submission: {
        Args: {
          p_channel: string
          p_hash: string
          p_organization: string
          p_owner: string
          p_payload: Json
          p_sku: string
          p_target: Json
          p_version: string
        }
        Returns: string
      }
      reserve_catalog_feed: {
        Args: {
          p_manifest: Json
          p_manifest_hash: string
          p_organization: string
          p_owner: string
          p_payload: Json
          p_retry_of?: string
          p_target: Json
        }
        Returns: string
      }
      set_catalog_archive: {
        Args: {
          p_archive: boolean
          p_organization: string
          p_owner: string
          p_reason: string
          p_sku: string
          p_version: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

