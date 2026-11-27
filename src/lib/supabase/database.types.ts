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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      notes: {
        Row: {
          content: string
          created_at: string
          id: string
          learned_on: string
          subject_id: string | null
          syllabus_item_id: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          learned_on?: string
          subject_id?: string | null
          syllabus_item_id?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          learned_on?: string
          subject_id?: string | null
          syllabus_item_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_syllabus_item_id_fkey"
            columns: ["syllabus_item_id"]
            isOneToOne: false
            referencedRelation: "syllabus_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          group_name: string | null
          group_number: string | null
          mentor_name: string | null
          program_start: string
          updated_at: string
          user_id: string
          vocab_layout_at: string | null
          vocab_layout_params: Json | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          group_name?: string | null
          group_number?: string | null
          mentor_name?: string | null
          program_start?: string
          updated_at?: string
          user_id?: string
          vocab_layout_at?: string | null
          vocab_layout_params?: Json | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          group_name?: string | null
          group_number?: string | null
          mentor_name?: string | null
          program_start?: string
          updated_at?: string
          user_id?: string
          vocab_layout_at?: string | null
          vocab_layout_params?: Json | null
        }
        Relationships: []
      }
      resources: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          status: string
          storage_path: string | null
          subject_id: string | null
          syllabus_item_id: string | null
          title: string
          type: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          storage_path?: string | null
          subject_id?: string | null
          syllabus_item_id?: string | null
          title: string
          type?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          storage_path?: string | null
          subject_id?: string | null
          syllabus_item_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_syllabus_item_id_fkey"
            columns: ["syllabus_item_id"]
            isOneToOne: false
            referencedRelation: "syllabus_items"
            referencedColumns: ["id"]
          },
        ]
      }
      study_languages: {
        Row: {
          code: string | null
          color: string
          countries: string[]
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code?: string | null
          color?: string
          countries?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          code?: string | null
          color?: string
          countries?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_words: {
        Row: {
          created_at: string
          deleted_at: string | null
          example: string | null
          id: string
          language_id: string
          learned_on: string
          meaning: string
          notes: string | null
          reading: string | null
          region: string | null
          updated_at: string
          user_id: string
          word: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          example?: string | null
          id?: string
          language_id: string
          learned_on?: string
          meaning?: string
          notes?: string | null
          reading?: string | null
          region?: string | null
          updated_at?: string
          user_id?: string
          word: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          example?: string | null
          id?: string
          language_id?: string
          learned_on?: string
          meaning?: string
          notes?: string | null
          reading?: string | null
          region?: string | null
          updated_at?: string
          user_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_words_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "study_languages"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      syllabus_items: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          position: number
          status: string
          subject_id: string
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          status?: string
          subject_id: string
          target_date?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          status?: string
          subject_id?: string
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "syllabus_items_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_domains: {
        Row: {
          color: string
          created_at: string
          deleted_at: string | null
          description: string
          embedding: string | null
          embedding_model: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          description?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          description?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocab_domains_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vocab_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_term_domains: {
        Row: {
          created_at: string
          domain_id: string
          term_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domain_id: string
          term_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          domain_id?: string
          term_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocab_term_domains_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "vocab_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocab_term_domains_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "vocab_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_terms: {
        Row: {
          aliases: string[]
          created_at: string
          definition: string
          deleted_at: string | null
          domain_id: string | null
          domain_scores: Json | null
          domain_source: string
          embedded_at: string | null
          embedding: string | null
          embedding_model: string | null
          id: string
          learned_on: string
          map_placed: string | null
          map_x: number | null
          map_y: number | null
          note_id: string | null
          subject_id: string | null
          syllabus_item_id: string | null
          term: string
          updated_at: string
          user_id: string
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          definition?: string
          deleted_at?: string | null
          domain_id?: string | null
          domain_scores?: Json | null
          domain_source?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          learned_on?: string
          map_placed?: string | null
          map_x?: number | null
          map_y?: number | null
          note_id?: string | null
          subject_id?: string | null
          syllabus_item_id?: string | null
          term: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          aliases?: string[]
          created_at?: string
          definition?: string
          deleted_at?: string | null
          domain_id?: string | null
          domain_scores?: Json | null
          domain_source?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          learned_on?: string
          map_placed?: string | null
          map_x?: number | null
          map_y?: number | null
          note_id?: string | null
          subject_id?: string | null
          syllabus_item_id?: string | null
          term?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocab_terms_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "vocab_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocab_terms_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocab_terms_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocab_terms_syllabus_item_id_fkey"
            columns: ["syllabus_item_id"]
            isOneToOne: false
            referencedRelation: "syllabus_items"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reports: {
        Row: {
          created_at: string
          id: string
          learning_challenge: string
          learning_learned: string
          learning_next_target: string
          learning_worked_on: string
          links: string
          period_end: string
          period_start: string
          project_decisions: string
          project_done: string
          project_next: string
          project_obstacles: string
          sent_at: string | null
          share_token: string | null
          status: string
          updated_at: string
          user_id: string
          week_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          learning_challenge?: string
          learning_learned?: string
          learning_next_target?: string
          learning_worked_on?: string
          links?: string
          period_end: string
          period_start: string
          project_decisions?: string
          project_done?: string
          project_next?: string
          project_obstacles?: string
          sent_at?: string | null
          share_token?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          week_number: number
        }
        Update: {
          created_at?: string
          id?: string
          learning_challenge?: string
          learning_learned?: string
          learning_next_target?: string
          learning_worked_on?: string
          links?: string
          period_end?: string
          period_start?: string
          project_decisions?: string
          project_done?: string
          project_next?: string
          project_obstacles?: string
          sent_at?: string | null
          share_token?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          week_number?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_vocab_domain: { Args: { p_id: string }; Returns: number }
      get_shared_report: { Args: { p_token: string }; Returns: Json }
      make_primary_vocab_domain: {
        Args: { p_domain_id: string; p_term_id: string }
        Returns: undefined
      }
      match_vocab_terms: {
        Args: { p_count?: number; p_term_id: string }
        Returns: {
          domain_id: string
          id: string
          map_x: number
          map_y: number
          similarity: number
          term: string
        }[]
      }
      merge_vocab_domains: {
        Args: { p_from: string; p_into: string }
        Returns: number
      }
      save_vocab_classification: { Args: { p_items: Json }; Returns: number }
      save_vocab_embeddings: {
        Args: { p_items: Json; p_kind: string }
        Returns: number
      }
      save_vocab_layout: {
        Args: { p_coords: Json; p_params: Json }
        Returns: number
      }
      save_vocab_placements: { Args: { p_items: Json }; Returns: number }
      suggest_vocab_domains: {
        Args: { p_min_terms?: number; p_term_ids: string[] }
        Returns: {
          centroid_sim: number
          domain_id: string
          n_terms: number
          parent_id: string
          proto_sim: number
          term_id: string
        }[]
      }
      vocab_embeddings: {
        Args: never
        Returns: {
          domain_id: string
          domain_source: string
          embedding: number[]
          id: string
        }[]
      }
      vocab_knn_neighbors: {
        Args: { p_k?: number; p_term_ids: string[] }
        Returns: {
          map_x: number
          map_y: number
          neighbor_id: string
          similarity: number
          term_id: string
        }[]
      }
      vocab_map_points: {
        Args: never
        Returns: {
          aliases: string[]
          domain_id: string
          domain_source: string
          extra_domain_ids: string[]
          has_embedding: boolean
          id: string
          learned_on: string
          map_placed: string
          map_x: number
          map_y: number
          snippet: string
          term: string
        }[]
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
