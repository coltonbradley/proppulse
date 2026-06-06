// Auto-generate the real version with: npx supabase gen types typescript --project-id YOUR_PROJECT_ID
// This stub lets TypeScript compile until you run the generator.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          username: string
          avatar_url: string | null
          is_premium: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      games: {
        Row: {
          id: string
          external_id: string
          sport: 'nba' | 'nfl' | 'mlb'
          home_team: string
          away_team: string
          starts_at: string
          status: 'scheduled' | 'live' | 'finished'
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['games']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['games']['Insert']>
      }
      questions: {
        Row: {
          id: string
          game_id: string
          sport: string
          question_type: 'player_prop' | 'game_line' | 'over_under' | 'match_winner'
          question_text: string
          options: { label: string }[]
          closes_at: string
          status: 'open' | 'closed' | 'resolved'
          correct_option: number | null
          stat: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['questions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['questions']['Insert']>
      }
      picks: {
        Row: {
          id: string
          user_id: string
          question_id: string
          option_index: number
          community_pct_at_vote: number | null
          picked_at: string
          result: 'pending' | 'win' | 'loss' | 'push'
        }
        Insert: Omit<Database['public']['Tables']['picks']['Row'], 'id' | 'picked_at'>
        Update: Partial<Database['public']['Tables']['picks']['Insert']>
      }
      consensus: {
        Row: {
          question_id: string
          option_index: number
          vote_count: number
          pct: number
          updated_at: string
        }
        Insert: Database['public']['Tables']['consensus']['Row']
        Update: Partial<Database['public']['Tables']['consensus']['Row']>
      }
      consensus_results: {
        Row: {
          id: string
          question_id: string | null
          winning_option_index: number | null
          total_votes: number | null
          crowd_was_correct: boolean | null
          consensus_bracket: string | null
          sport: string | null
          prop_type: string | null
          majority_pct: number | null
          resolved_at: string
        }
        Insert: Omit<Database['public']['Tables']['consensus_results']['Row'], 'id' | 'resolved_at'>
        Update: Partial<Database['public']['Tables']['consensus_results']['Insert']>
      }
      user_stats: {
        Row: {
          user_id: string
          total_picks: number
          correct_picks: number
          accuracy_pct: number
          vs_community_pct: number
          current_streak: number
          longest_streak: number
          sport_breakdown: Record<string, { total: number; correct: number }>
          fade_accuracy: number
          follow_accuracy: number
          best_sport: string | null
          best_prop_type: string | null
          contrarian_score: number
          total_fade_picks: number
          total_follow_picks: number
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['user_stats']['Row'], 'updated_at'>
        Update: Partial<Database['public']['Tables']['user_stats']['Insert']>
      }
    }
    Functions: {
      cast_vote: {
        Args: { p_question_id: string; p_option_index: number }
        Returns: Array<{ option_index: number; vote_count: number; pct: number }>
      }
      get_consensus_accuracy: {
        Args: Record<string, never>
        Returns: Array<{
          bracket: string
          sport: string
          total_questions: number
          correct: number
          accuracy_pct: number
        }>
      }
      get_herd_accuracy: {
        Args: { p_min_pct?: number }
        Returns: Array<{ total: number; correct: number; accuracy_pct: number }>
      }
    }
  }
}
