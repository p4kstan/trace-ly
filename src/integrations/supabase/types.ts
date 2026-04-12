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
      identities: {
        Row: {
          email_hash: string | null
          external_id: string | null
          fingerprint: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          phone_hash: string | null
          workspace_id: string
        }
        Insert: {
          email_hash?: string | null
          external_id?: string | null
          fingerprint?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          phone_hash?: string | null
          workspace_id: string
        }
        Update: {
          email_hash?: string | null
          external_id?: string | null
          fingerprint?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
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
      sessions: {
        Row: {
          anonymous_id: string | null
          city: string | null
          country: string | null
          created_at: string
          fbc: string | null
          fbp: string | null
          id: string
          identity_id: string | null
          ip_hash: string | null
          landing_page: string | null
          referrer: string | null
          region: string | null
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
          fbp?: string | null
          id?: string
          identity_id?: string | null
          ip_hash?: string | null
          landing_page?: string | null
          referrer?: string | null
          region?: string | null
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
          fbp?: string | null
          id?: string
          identity_id?: string | null
          ip_hash?: string | null
          landing_page?: string | null
          referrer?: string | null
          region?: string | null
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
      [_ in never]: never
    }
    Functions: {
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
