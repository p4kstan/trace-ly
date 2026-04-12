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
      allowed_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          meta_pixel_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          meta_pixel_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          meta_pixel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allowed_domains_meta_pixel_id_fkey"
            columns: ["meta_pixel_id"]
            isOneToOne: false
            referencedRelation: "meta_pixels"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          public_key: string
          secret_key_hash: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          public_key: string
          secret_key_hash: string
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          public_key?: string
          secret_key_hash?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      attribution_touches: {
        Row: {
          campaign: string | null
          content: string | null
          created_at: string
          id: string
          identity_id: string | null
          medium: string | null
          session_id: string | null
          source: string | null
          term: string | null
          touch_time: string
          touch_type: string | null
          workspace_id: string
        }
        Insert: {
          campaign?: string | null
          content?: string | null
          created_at?: string
          id?: string
          identity_id?: string | null
          medium?: string | null
          session_id?: string | null
          source?: string | null
          term?: string | null
          touch_time?: string
          touch_type?: string | null
          workspace_id: string
        }
        Update: {
          campaign?: string | null
          content?: string | null
          created_at?: string
          id?: string
          identity_id?: string | null
          medium?: string | null
          session_id?: string | null
          source?: string | null
          term?: string | null
          touch_time?: string
          touch_type?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribution_touches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata_json: Json | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata_json?: Json | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata_json?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversions: {
        Row: {
          attributed_campaign: string | null
          attributed_source: string | null
          attribution_model: string | null
          conversion_type: string
          created_at: string
          currency: string | null
          event_id: string
          happened_at: string
          id: string
          identity_id: string | null
          session_id: string | null
          value: number | null
          workspace_id: string
        }
        Insert: {
          attributed_campaign?: string | null
          attributed_source?: string | null
          attribution_model?: string | null
          conversion_type: string
          created_at?: string
          currency?: string | null
          event_id: string
          happened_at?: string
          id?: string
          identity_id?: string | null
          session_id?: string | null
          value?: number | null
          workspace_id: string
        }
        Update: {
          attributed_campaign?: string | null
          attributed_source?: string | null
          attribution_model?: string | null
          conversion_type?: string
          created_at?: string
          currency?: string | null
          event_id?: string
          happened_at?: string
          id?: string
          identity_id?: string | null
          session_id?: string | null
          value?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dead_letter_events: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          last_retry_at: string | null
          payload_json: Json | null
          provider: string | null
          retry_count: number
          source_id: string | null
          source_type: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_retry_at?: string | null
          payload_json?: Json | null
          provider?: string | null
          retry_count?: number
          source_id?: string | null
          source_type: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_retry_at?: string | null
          payload_json?: Json | null
          provider?: string | null
          retry_count?: number
          source_id?: string | null
          source_type?: string
          workspace_id?: string
        }
        Relationships: []
      }
      event_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          destination: string | null
          error_message: string | null
          event_id: string
          id: string
          last_attempt_at: string | null
          provider: string
          request_json: Json | null
          response_json: Json | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          destination?: string | null
          error_message?: string | null
          event_id: string
          id?: string
          last_attempt_at?: string | null
          provider: string
          request_json?: Json | null
          response_json?: Json | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          destination?: string | null
          error_message?: string | null
          event_id?: string
          id?: string
          last_attempt_at?: string | null
          provider?: string
          request_json?: Json | null
          response_json?: Json | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_mappings: {
        Row: {
          conditions_json: Json | null
          config_json: Json | null
          created_at: string
          enabled: boolean
          external_event_name: string | null
          external_platform: string | null
          gateway: string
          gateway_event: string
          id: string
          internal_event_name: string | null
          is_active: boolean
          marketing_event: string
          provider: string | null
          workspace_id: string
        }
        Insert: {
          conditions_json?: Json | null
          config_json?: Json | null
          created_at?: string
          enabled?: boolean
          external_event_name?: string | null
          external_platform?: string | null
          gateway: string
          gateway_event: string
          id?: string
          internal_event_name?: string | null
          is_active?: boolean
          marketing_event: string
          provider?: string | null
          workspace_id: string
        }
        Update: {
          conditions_json?: Json | null
          config_json?: Json | null
          created_at?: string
          enabled?: boolean
          external_event_name?: string | null
          external_platform?: string | null
          gateway?: string
          gateway_event?: string
          id?: string
          internal_event_name?: string | null
          is_active?: boolean
          marketing_event?: string
          provider?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      event_queue: {
        Row: {
          attempt_count: number
          created_at: string
          destination: string | null
          event_id: string | null
          id: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string
          order_id: string | null
          payload_json: Json
          provider: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          destination?: string | null
          event_id?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string
          order_id?: string | null
          payload_json?: Json
          provider?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          destination?: string | null
          event_id?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string
          order_id?: string | null
          payload_json?: Json
          provider?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2025_01: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2025_02: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2025_03: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2025_04: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2025_05: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2025_06: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2025_07: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2025_08: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2025_09: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2025_10: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2025_11: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2025_12: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2026_01: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2026_02: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2026_03: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2026_04: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2026_05: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2026_06: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2026_07: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2026_08: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2026_09: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2026_10: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2026_11: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      events_2026_12: {
        Row: {
          action_source: string | null
          created_at: string
          custom_data_json: Json | null
          deduplication_key: string | null
          event_id: string | null
          event_name: string
          event_source_url: string | null
          event_time: string
          id: string
          identity_id: string | null
          page_path: string | null
          payload_json: Json | null
          pixel_id: string | null
          processing_status: string
          received_at: string
          session_id: string | null
          source: string | null
          user_data_json: Json | null
          workspace_id: string
        }
        Insert: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id: string
        }
        Update: {
          action_source?: string | null
          created_at?: string
          custom_data_json?: Json | null
          deduplication_key?: string | null
          event_id?: string | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string
          id?: string
          identity_id?: string | null
          page_path?: string | null
          payload_json?: Json | null
          pixel_id?: string | null
          processing_status?: string
          received_at?: string
          session_id?: string | null
          source?: string | null
          user_data_json?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      gateway_api_sync_logs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          gateway_integration_id: string | null
          id: string
          provider: string
          request_json: Json | null
          response_json: Json | null
          started_at: string
          status: string
          sync_type: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          gateway_integration_id?: string | null
          id?: string
          provider: string
          request_json?: Json | null
          response_json?: Json | null
          started_at?: string
          status?: string
          sync_type: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          gateway_integration_id?: string | null
          id?: string
          provider?: string
          request_json?: Json | null
          response_json?: Json | null
          started_at?: string
          status?: string
          sync_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_api_sync_logs_gateway_integration_id_fkey"
            columns: ["gateway_integration_id"]
            isOneToOne: false
            referencedRelation: "gateway_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_api_sync_logs_gateway_integration_id_fkey"
            columns: ["gateway_integration_id"]
            isOneToOne: false
            referencedRelation: "gateway_integrations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_customers: {
        Row: {
          created_at: string
          document: string | null
          email: string | null
          external_customer_id: string | null
          gateway_integration_id: string | null
          id: string
          identity_id: string | null
          name: string | null
          phone: string | null
          provider: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email?: string | null
          external_customer_id?: string | null
          gateway_integration_id?: string | null
          id?: string
          identity_id?: string | null
          name?: string | null
          phone?: string | null
          provider: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string | null
          external_customer_id?: string | null
          gateway_integration_id?: string | null
          id?: string
          identity_id?: string | null
          name?: string | null
          phone?: string | null
          provider?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_customers_gateway_integration_id_fkey"
            columns: ["gateway_integration_id"]
            isOneToOne: false
            referencedRelation: "gateway_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_customers_gateway_integration_id_fkey"
            columns: ["gateway_integration_id"]
            isOneToOne: false
            referencedRelation: "gateway_integrations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_integrations: {
        Row: {
          api_base_url: string | null
          created_at: string
          credentials_encrypted: string | null
          environment: string
          id: string
          last_sync_at: string | null
          name: string
          provider: string
          public_config_json: Json | null
          settings_json: Json | null
          status: string
          updated_at: string
          webhook_secret_encrypted: string | null
          workspace_id: string
        }
        Insert: {
          api_base_url?: string | null
          created_at?: string
          credentials_encrypted?: string | null
          environment?: string
          id?: string
          last_sync_at?: string | null
          name: string
          provider: string
          public_config_json?: Json | null
          settings_json?: Json | null
          status?: string
          updated_at?: string
          webhook_secret_encrypted?: string | null
          workspace_id: string
        }
        Update: {
          api_base_url?: string | null
          created_at?: string
          credentials_encrypted?: string | null
          environment?: string
          id?: string
          last_sync_at?: string | null
          name?: string
          provider?: string
          public_config_json?: Json | null
          settings_json?: Json | null
          status?: string
          updated_at?: string
          webhook_secret_encrypted?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      gateway_webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string | null
          external_event_id: string | null
          gateway_integration_id: string | null
          http_headers_json: Json | null
          id: string
          payload_json: Json | null
          processed_at: string | null
          processing_attempts: number
          processing_status: string
          provider: string
          query_params_json: Json | null
          received_at: string
          signature_valid: boolean | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          external_event_id?: string | null
          gateway_integration_id?: string | null
          http_headers_json?: Json | null
          id?: string
          payload_json?: Json | null
          processed_at?: string | null
          processing_attempts?: number
          processing_status?: string
          provider: string
          query_params_json?: Json | null
          received_at?: string
          signature_valid?: boolean | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          external_event_id?: string | null
          gateway_integration_id?: string | null
          http_headers_json?: Json | null
          id?: string
          payload_json?: Json | null
          processed_at?: string | null
          processing_attempts?: number
          processing_status?: string
          provider?: string
          query_params_json?: Json | null
          received_at?: string
          signature_valid?: boolean | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_webhook_logs_gateway_integration_id_fkey"
            columns: ["gateway_integration_id"]
            isOneToOne: false
            referencedRelation: "gateway_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_webhook_logs_gateway_integration_id_fkey"
            columns: ["gateway_integration_id"]
            isOneToOne: false
            referencedRelation: "gateway_integrations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      identities: {
        Row: {
          email: string | null
          email_hash: string | null
          external_id: string | null
          fingerprint: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          name: string | null
          phone: string | null
          phone_hash: string | null
          workspace_id: string
        }
        Insert: {
          email?: string | null
          email_hash?: string | null
          external_id?: string | null
          fingerprint?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          name?: string | null
          phone?: string | null
          phone_hash?: string | null
          workspace_id: string
        }
        Update: {
          email?: string | null
          email_hash?: string | null
          external_id?: string | null
          fingerprint?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          name?: string | null
          phone?: string | null
          phone_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_destinations: {
        Row: {
          access_token_encrypted: string | null
          config_json: Json | null
          created_at: string
          destination_id: string
          display_name: string
          events_sent_count: number
          id: string
          is_active: boolean
          last_event_at: string | null
          provider: string
          test_event_code: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          config_json?: Json | null
          created_at?: string
          destination_id: string
          display_name?: string
          events_sent_count?: number
          id?: string
          is_active?: boolean
          last_event_at?: string | null
          provider: string
          test_event_code?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          config_json?: Json | null
          created_at?: string
          destination_id?: string
          display_name?: string
          events_sent_count?: number
          id?: string
          is_active?: boolean
          last_event_at?: string | null
          provider?: string
          test_event_code?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          created_at: string
          document: string | null
          email: string | null
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          gclid: string | null
          id: string
          identity_id: string | null
          landing_page: string | null
          name: string | null
          phone: string | null
          pixel_id: string | null
          referrer: string | null
          session_id: string | null
          source: string | null
          ttclid: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gclid?: string | null
          id?: string
          identity_id?: string | null
          landing_page?: string | null
          name?: string | null
          phone?: string | null
          pixel_id?: string | null
          referrer?: string | null
          session_id?: string | null
          source?: string | null
          ttclid?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gclid?: string | null
          id?: string
          identity_id?: string | null
          landing_page?: string | null
          name?: string | null
          phone?: string | null
          pixel_id?: string | null
          referrer?: string | null
          session_id?: string | null
          source?: string | null
          ttclid?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      mcp_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          request_json: Json | null
          response_json: Json | null
          status: string
          token_id: string | null
          tool: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          request_json?: Json | null
          response_json?: Json | null
          status?: string
          token_id?: string | null
          tool: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          request_json?: Json | null
          response_json?: Json | null
          status?: string
          token_id?: string | null
          tool?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_logs_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "mcp_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          permissions: string[]
          revoked: boolean
          token: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          permissions?: string[]
          revoked?: boolean
          token: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          permissions?: string[]
          revoked?: boolean
          token?: string
          workspace_id?: string
        }
        Relationships: []
      }
      meta_pixels: {
        Row: {
          access_token_encrypted: string | null
          allow_all_domains: boolean
          created_at: string
          id: string
          is_active: boolean
          name: string
          pixel_id: string
          test_event_code: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          allow_all_domains?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          pixel_id: string
          test_event_code?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          allow_all_domains?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          pixel_id?: string
          test_event_code?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_pixels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          category: string | null
          created_at: string
          external_item_id: string | null
          id: string
          order_id: string
          product_id: string | null
          product_name: string | null
          quantity: number
          sku: string | null
          total_price: number | null
          unit_price: number | null
          variant_name: string | null
          workspace_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          external_item_id?: string | null
          id?: string
          order_id: string
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          sku?: string | null
          total_price?: number | null
          unit_price?: number | null
          variant_name?: string | null
          workspace_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          external_item_id?: string | null
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          sku?: string | null
          total_price?: number | null
          unit_price?: number | null
          variant_name?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          canceled_at: string | null
          coupon_code: string | null
          created_at: string
          currency: string | null
          current_page: string | null
          customer_document: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_value: number | null
          external_checkout_id: string | null
          external_subscription_id: string | null
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          financial_status: string | null
          first_page: string | null
          fulfillment_status: string | null
          gateway: string
          gateway_integration_id: string | null
          gateway_order_id: string | null
          gclid: string | null
          id: string
          identity_id: string | null
          installments: number | null
          landing_page: string | null
          order_created_at: string | null
          paid_at: string | null
          payment_method: string | null
          pixel_id: string | null
          referrer: string | null
          refunded_at: string | null
          session_id: string | null
          shipping_value: number | null
          status: string
          subtotal_value: number | null
          total_value: number | null
          ttclid: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          workspace_id: string
        }
        Insert: {
          canceled_at?: string | null
          coupon_code?: string | null
          created_at?: string
          currency?: string | null
          current_page?: string | null
          customer_document?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_value?: number | null
          external_checkout_id?: string | null
          external_subscription_id?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          financial_status?: string | null
          first_page?: string | null
          fulfillment_status?: string | null
          gateway: string
          gateway_integration_id?: string | null
          gateway_order_id?: string | null
          gclid?: string | null
          id?: string
          identity_id?: string | null
          installments?: number | null
          landing_page?: string | null
          order_created_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pixel_id?: string | null
          referrer?: string | null
          refunded_at?: string | null
          session_id?: string | null
          shipping_value?: number | null
          status?: string
          subtotal_value?: number | null
          total_value?: number | null
          ttclid?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          workspace_id: string
        }
        Update: {
          canceled_at?: string | null
          coupon_code?: string | null
          created_at?: string
          currency?: string | null
          current_page?: string | null
          customer_document?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_value?: number | null
          external_checkout_id?: string | null
          external_subscription_id?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          financial_status?: string | null
          first_page?: string | null
          fulfillment_status?: string | null
          gateway?: string
          gateway_integration_id?: string | null
          gateway_order_id?: string | null
          gclid?: string | null
          id?: string
          identity_id?: string | null
          installments?: number | null
          landing_page?: string | null
          order_created_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pixel_id?: string | null
          referrer?: string | null
          refunded_at?: string | null
          session_id?: string | null
          shipping_value?: number | null
          status?: string
          subtotal_value?: number | null
          total_value?: number | null
          ttclid?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_gateway_integration_id_fkey"
            columns: ["gateway_integration_id"]
            isOneToOne: false
            referencedRelation: "gateway_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_gateway_integration_id_fkey"
            columns: ["gateway_integration_id"]
            isOneToOne: false
            referencedRelation: "gateway_integrations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number | null
          boleto_barcode: string | null
          boleto_url: string | null
          chargeback_at: string | null
          created_at: string
          currency: string | null
          due_at: string | null
          external_charge_id: string | null
          fee_amount: number | null
          gateway: string
          gateway_integration_id: string | null
          gateway_payment_id: string | null
          id: string
          installments: number | null
          net_amount: number | null
          order_id: string | null
          paid_at: string | null
          payment_method: string | null
          payment_type: string | null
          pix_qr_code: string | null
          raw_payload_json: Json | null
          refunded_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount?: number | null
          boleto_barcode?: string | null
          boleto_url?: string | null
          chargeback_at?: string | null
          created_at?: string
          currency?: string | null
          due_at?: string | null
          external_charge_id?: string | null
          fee_amount?: number | null
          gateway: string
          gateway_integration_id?: string | null
          gateway_payment_id?: string | null
          id?: string
          installments?: number | null
          net_amount?: number | null
          order_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_type?: string | null
          pix_qr_code?: string | null
          raw_payload_json?: Json | null
          refunded_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number | null
          boleto_barcode?: string | null
          boleto_url?: string | null
          chargeback_at?: string | null
          created_at?: string
          currency?: string | null
          due_at?: string | null
          external_charge_id?: string | null
          fee_amount?: number | null
          gateway?: string
          gateway_integration_id?: string | null
          gateway_payment_id?: string | null
          id?: string
          installments?: number | null
          net_amount?: number | null
          order_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_type?: string | null
          pix_qr_code?: string | null
          raw_payload_json?: Json | null
          refunded_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_gateway_integration_id_fkey"
            columns: ["gateway_integration_id"]
            isOneToOne: false
            referencedRelation: "gateway_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_gateway_integration_id_fkey"
            columns: ["gateway_integration_id"]
            isOneToOne: false
            referencedRelation: "gateway_integrations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reconciliation_logs: {
        Row: {
          created_at: string
          details_json: Json | null
          entity_id: string | null
          entity_type: string
          external_id: string | null
          id: string
          provider: string | null
          reconciliation_type: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          details_json?: Json | null
          entity_id?: string | null
          entity_type: string
          external_id?: string | null
          id?: string
          provider?: string | null
          reconciliation_type: string
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          details_json?: Json | null
          entity_id?: string | null
          entity_type?: string
          external_id?: string | null
          id?: string
          provider?: string | null
          reconciliation_type?: string
          status?: string
          workspace_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          anonymous_id: string | null
          city: string | null
          country: string | null
          created_at: string
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          gclid: string | null
          id: string
          identity_id: string | null
          ip_hash: string | null
          landing_page: string | null
          referrer: string | null
          region: string | null
          ttclid: string | null
          updated_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          workspace_id: string
        }
        Insert: {
          anonymous_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gclid?: string | null
          id?: string
          identity_id?: string | null
          ip_hash?: string | null
          landing_page?: string | null
          referrer?: string | null
          region?: string | null
          ttclid?: string | null
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          workspace_id: string
        }
        Update: {
          anonymous_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gclid?: string | null
          id?: string
          identity_id?: string | null
          ip_hash?: string | null
          landing_page?: string | null
          referrer?: string | null
          region?: string | null
          ttclid?: string | null
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          features_json: Json | null
          id: string
          monthly_event_limit: number | null
          name: string
          pixel_limit: number | null
          workspace_limit: number | null
        }
        Insert: {
          features_json?: Json | null
          id?: string
          monthly_event_limit?: number | null
          name: string
          pixel_limit?: number | null
          workspace_limit?: number | null
        }
        Update: {
          features_json?: Json | null
          id?: string
          monthly_event_limit?: number | null
          name?: string
          pixel_limit?: number | null
          workspace_limit?: number | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          error_message: string | null
          event_type: string | null
          gateway: string
          id: string
          payload_json: Json | null
          processed_at: string | null
          processing_status: string
          received_at: string
          signature_valid: boolean | null
          workspace_id: string
        }
        Insert: {
          error_message?: string | null
          event_type?: string | null
          gateway: string
          id?: string
          payload_json?: Json | null
          processed_at?: string | null
          processing_status?: string
          received_at?: string
          signature_valid?: boolean | null
          workspace_id: string
        }
        Update: {
          error_message?: string | null
          event_type?: string | null
          gateway?: string
          id?: string
          payload_json?: Json | null
          processed_at?: string | null
          processing_status?: string
          received_at?: string
          signature_valid?: boolean | null
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          plan: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          plan?: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          plan?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      gateway_integrations_safe: {
        Row: {
          api_base_url: string | null
          created_at: string | null
          environment: string | null
          id: string | null
          last_sync_at: string | null
          name: string | null
          provider: string | null
          public_config_json: Json | null
          settings_json: Json | null
          status: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          api_base_url?: string | null
          created_at?: string | null
          environment?: string | null
          id?: string | null
          last_sync_at?: string | null
          name?: string | null
          provider?: string | null
          public_config_json?: Json | null
          settings_json?: Json | null
          status?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          api_base_url?: string | null
          created_at?: string | null
          environment?: string | null
          id?: string | null
          last_sync_at?: string | null
          name?: string | null
          provider?: string | null
          public_config_json?: Json | null
          settings_json?: Json | null
          status?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_integration_metadata: {
        Args: { _workspace_id: string }
        Returns: {
          api_base_url: string
          created_at: string
          environment: string
          id: string
          last_sync_at: string
          name: string
          provider: string
          public_config_json: Json
          settings_json: Json
          status: string
          updated_at: string
          workspace_id: string
        }[]
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
