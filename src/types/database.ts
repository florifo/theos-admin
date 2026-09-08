export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      applications: {
        Row: {
          applicant_id: string
          applied_at: string | null
          assigned_to: string | null
          created_at: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string | null
          vacancy_id: string
        }
        Insert: {
          applicant_id: string
          applied_at?: string | null
          assigned_to?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string | null
          vacancy_id: string
        }
        Update: {
          applicant_id?: string
          applied_at?: string | null
          assigned_to?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string | null
          vacancy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_vacancy_id_fkey"
            columns: ["vacancy_id"]
            isOneToOne: false
            referencedRelation: "vacancies"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          area_type: string
          created_at: string | null
          description: string | null
          id: string
          ideal_capacity: number | null
          is_active: boolean | null
          leader_id: string | null
          name: string
          parent_id: string | null
          updated_at: string | null
        }
        Insert: {
          area_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          ideal_capacity?: number | null
          is_active?: boolean | null
          leader_id?: string | null
          name: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          area_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          ideal_capacity?: number | null
          is_active?: boolean | null
          leader_id?: string | null
          name?: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "areas_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
        }
        Relationships: []
      }
      birthday_greetings: {
        Row: {
          id: string
          member_id: string
          sent_at: string
          year: number
        }
        Insert: {
          id?: string
          member_id: string
          sent_at?: string
          year: number
        }
        Update: {
          id?: string
          member_id?: string
          sent_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "birthday_greetings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      capacitacion_bloques: {
        Row: {
          anio: number
          confirmacion_sent_at: string | null
          created_at: string | null
          estado: string
          fecha_apertura: string
          fecha_cierre_matricula: string
          final_sent_at: string | null
          id: string
          nombre: string
          preliminar_sent_at: string | null
          updated_at: string | null
        }
        Insert: {
          anio: number
          confirmacion_sent_at?: string | null
          created_at?: string | null
          estado?: string
          fecha_apertura: string
          fecha_cierre_matricula: string
          final_sent_at?: string | null
          id?: string
          nombre: string
          preliminar_sent_at?: string | null
          updated_at?: string | null
        }
        Update: {
          anio?: number
          confirmacion_sent_at?: string | null
          created_at?: string | null
          estado?: string
          fecha_apertura?: string
          fecha_cierre_matricula?: string
          final_sent_at?: string | null
          id?: string
          nombre?: string
          preliminar_sent_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cdeb_recommendations: {
        Row: {
          bible_knowledge_score: string | null
          commitment_notes: string | null
          committee_notes: string | null
          completion_date: string | null
          convictions: Json
          created_at: string
          enrollment_id: string | null
          filled_by: string | null
          group_id: string
          id: string
          member_id: string
          passion_notes: string | null
          passion_score: string | null
          recommendation: string | null
          recommended_prior_study: string | null
          speech_notes: string | null
          speech_score: string | null
          status: string
          testimony_notes: string | null
          testimony_score: string | null
          updated_at: string
        }
        Insert: {
          bible_knowledge_score?: string | null
          commitment_notes?: string | null
          committee_notes?: string | null
          completion_date?: string | null
          convictions?: Json
          created_at?: string
          enrollment_id?: string | null
          filled_by?: string | null
          group_id: string
          id?: string
          member_id: string
          passion_notes?: string | null
          passion_score?: string | null
          recommendation?: string | null
          recommended_prior_study?: string | null
          speech_notes?: string | null
          speech_score?: string | null
          status?: string
          testimony_notes?: string | null
          testimony_score?: string | null
          updated_at?: string
        }
        Update: {
          bible_knowledge_score?: string | null
          commitment_notes?: string | null
          committee_notes?: string | null
          completion_date?: string | null
          convictions?: Json
          created_at?: string
          enrollment_id?: string | null
          filled_by?: string | null
          group_id?: string
          id?: string
          member_id?: string
          passion_notes?: string | null
          passion_score?: string | null
          recommendation?: string | null
          recommended_prior_study?: string | null
          speech_notes?: string | null
          speech_score?: string | null
          status?: string
          testimony_notes?: string | null
          testimony_score?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cdeb_recommendations_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "study_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cdeb_recommendations_filled_by_fkey"
            columns: ["filled_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cdeb_recommendations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cdeb_recommendations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_configs: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          last_verified_at: string | null
          name: string
          smtp_from_email: string | null
          smtp_from_name: string | null
          smtp_host: string | null
          smtp_port: number | null
          smtp_user: string | null
          type: string
          updated_at: string | null
          wa_account_id: string | null
          wa_phone_number: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          last_verified_at?: string | null
          name: string
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          type: string
          updated_at?: string | null
          wa_account_id?: string | null
          wa_phone_number?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          last_verified_at?: string | null
          name?: string
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          type?: string
          updated_at?: string | null
          wa_account_id?: string | null
          wa_phone_number?: string | null
        }
        Relationships: []
      }
      committee_goals: {
        Row: {
          committee_id: string
          created_at: string | null
          description: string
          due_date: string | null
          id: string
          status: string
        }
        Insert: {
          committee_id: string
          created_at?: string | null
          description: string
          due_date?: string | null
          id?: string
          status?: string
        }
        Update: {
          committee_id?: string
          created_at?: string | null
          description?: string
          due_date?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_goals_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      donations: {
        Row: {
          amount: number
          created_at: string | null
          currency: string
          donation_date: string
          family_unit_id: string | null
          id: string
          imported_at: string | null
          is_identified: boolean | null
          member_id: string | null
          refund_id: string | null
          source_file: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string
          donation_date: string
          family_unit_id?: string | null
          id?: string
          imported_at?: string | null
          is_identified?: boolean | null
          member_id?: string | null
          refund_id?: string | null
          source_file?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string
          donation_date?: string
          family_unit_id?: string | null
          id?: string
          imported_at?: string | null
          is_identified?: boolean | null
          member_id?: string | null
          refund_id?: string | null
          source_file?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donations_family_unit_id_fkey"
            columns: ["family_unit_id"]
            isOneToOne: false
            referencedRelation: "family_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_dismissals: {
        Row: {
          dismissed_at: string | null
          member_a: string
          member_b: string
        }
        Insert: {
          dismissed_at?: string | null
          member_a: string
          member_b: string
        }
        Update: {
          dismissed_at?: string | null
          member_a?: string
          member_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_dismissals_member_a_fkey"
            columns: ["member_a"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_dismissals_member_b_fkey"
            columns: ["member_b"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          created_at: string | null
          doc_type: string
          employee_id: string
          expires_at: string | null
          file_url: string | null
          id: string
          notes: string | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          doc_type: string
          employee_id: string
          expires_at?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          title: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          doc_type?: string
          employee_id?: string
          expires_at?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          contract_type: string | null
          created_at: string | null
          created_by: string | null
          department: string | null
          employee_code: string | null
          employment_type: string | null
          end_date: string | null
          id: string
          member_id: string | null
          notes: string | null
          position_id: string | null
          salary: number | null
          salary_currency: string | null
          start_date: string
          status: string | null
          termination_reason: string | null
          updated_at: string | null
          vacation_days_total: number | null
          vacation_days_used: number | null
        }
        Insert: {
          contract_type?: string | null
          created_at?: string | null
          created_by?: string | null
          department?: string | null
          employee_code?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: string
          member_id?: string | null
          notes?: string | null
          position_id?: string | null
          salary?: number | null
          salary_currency?: string | null
          start_date: string
          status?: string | null
          termination_reason?: string | null
          updated_at?: string | null
          vacation_days_total?: number | null
          vacation_days_used?: number | null
        }
        Update: {
          contract_type?: string | null
          created_at?: string | null
          created_by?: string | null
          department?: string | null
          employee_code?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: string
          member_id?: string | null
          notes?: string | null
          position_id?: string | null
          salary?: number | null
          salary_currency?: string | null
          start_date?: string
          status?: string | null
          termination_reason?: string | null
          updated_at?: string | null
          vacation_days_total?: number | null
          vacation_days_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "paid_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_ticket_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          notes: string | null
          ticket_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          ticket_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          ticket_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_ticket_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_ticket_status_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "evaluation_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_tickets: {
        Row: {
          created_at: string
          group_id: string
          id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_tickets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_tickets_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_tickets_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      event_checkins: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          event_id: string
          guest_name: string | null
          id: string
          member_id: string | null
          method: string | null
          notes: string | null
          sub_event_id: string | null
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          event_id: string
          guest_name?: string | null
          id?: string
          member_id?: string | null
          method?: string | null
          notes?: string | null
          sub_event_id?: string | null
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          event_id?: string
          guest_name?: string | null
          id?: string
          member_id?: string | null
          method?: string | null
          notes?: string | null
          sub_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_checkins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_checkins_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_checkins_sub_event_id_fkey"
            columns: ["sub_event_id"]
            isOneToOne: false
            referencedRelation: "sub_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_exceptions: {
        Row: {
          created_at: string | null
          exception_date: string
          id: string
          override_event_id: string | null
          parent_event_id: string
        }
        Insert: {
          created_at?: string | null
          exception_date: string
          id?: string
          override_event_id?: string | null
          parent_event_id: string
        }
        Update: {
          created_at?: string | null
          exception_date?: string
          id?: string
          override_event_id?: string | null
          parent_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_exceptions_override_event_id_fkey"
            columns: ["override_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_exceptions_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_managers: {
        Row: {
          event_id: string
          granted_at: string
          granted_by: string | null
          id: string
          member_id: string
        }
        Insert: {
          event_id: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          member_id: string
        }
        Update: {
          event_id?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_managers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_managers_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_managers_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      event_organizing_committees: {
        Row: {
          committee_id: string
          event_id: string
        }
        Insert: {
          committee_id: string
          event_id: string
        }
        Update: {
          committee_id?: string
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_organizing_committees_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_organizing_committees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          event_id: string
          form_response_id: string | null
          id: string
          member_id: string
          payment_status: string
          recorded_by: string | null
          registered_at: string | null
        }
        Insert: {
          event_id: string
          form_response_id?: string | null
          id?: string
          member_id: string
          payment_status?: string
          recorded_by?: string | null
          registered_at?: string | null
        }
        Update: {
          event_id?: string
          form_response_id?: string | null
          id?: string
          member_id?: string
          payment_status?: string
          recorded_by?: string | null
          registered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_form_response_id_fkey"
            columns: ["form_response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      event_types: {
        Row: {
          color: string
          created_at: string | null
          description: string | null
          icon: string
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          color?: string
          created_at?: string | null
          description?: string | null
          icon?: string
          id: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      event_volunteers: {
        Row: {
          assigned_by: string | null
          created_at: string | null
          event_id: string
          id: string
          member_id: string
          role: string | null
          status: string | null
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          member_id: string
          role?: string | null
          status?: string | null
        }
        Update: {
          assigned_by?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          member_id?: string
          role?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_volunteers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_volunteers_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          cancellation_reason: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          description: string | null
          ends_at: string | null
          event_type: string
          flyer_url: string | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          is_recurring: boolean | null
          is_virtual: boolean | null
          location: string | null
          location_url: string | null
          max_capacity: number | null
          parent_event_id: string | null
          payment_amount: number | null
          recurrence_end: string | null
          recurrence_rule: string | null
          registration_form_id: string | null
          requires_checkin: boolean | null
          requires_payment: boolean | null
          requires_registration: boolean | null
          requires_survey: boolean | null
          sede_id: string | null
          server_price: number | null
          servers_pay: boolean
          starts_at: string
          status: string | null
          survey_form_id: string | null
          survey_offset_hours: number | null
          survey_send_at: string | null
          survey_sent_at: string | null
          survey_sent_count: number
          survey_template_id: string | null
          title: string
          updated_at: string | null
          virtual_url: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          ends_at?: string | null
          event_type: string
          flyer_url?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          is_recurring?: boolean | null
          is_virtual?: boolean | null
          location?: string | null
          location_url?: string | null
          max_capacity?: number | null
          parent_event_id?: string | null
          payment_amount?: number | null
          recurrence_end?: string | null
          recurrence_rule?: string | null
          registration_form_id?: string | null
          requires_checkin?: boolean | null
          requires_payment?: boolean | null
          requires_registration?: boolean | null
          requires_survey?: boolean | null
          sede_id?: string | null
          server_price?: number | null
          servers_pay?: boolean
          starts_at: string
          status?: string | null
          survey_form_id?: string | null
          survey_offset_hours?: number | null
          survey_send_at?: string | null
          survey_sent_at?: string | null
          survey_sent_count?: number
          survey_template_id?: string | null
          title: string
          updated_at?: string | null
          virtual_url?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string
          flyer_url?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          is_recurring?: boolean | null
          is_virtual?: boolean | null
          location?: string | null
          location_url?: string | null
          max_capacity?: number | null
          parent_event_id?: string | null
          payment_amount?: number | null
          recurrence_end?: string | null
          recurrence_rule?: string | null
          registration_form_id?: string | null
          requires_checkin?: boolean | null
          requires_payment?: boolean | null
          requires_registration?: boolean | null
          requires_survey?: boolean | null
          sede_id?: string | null
          server_price?: number | null
          servers_pay?: boolean
          starts_at?: string
          status?: string | null
          survey_form_id?: string | null
          survey_offset_hours?: number | null
          survey_send_at?: string | null
          survey_sent_at?: string | null
          survey_sent_count?: number
          survey_template_id?: string | null
          title?: string
          updated_at?: string | null
          virtual_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_event_type_fkey"
            columns: ["event_type"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_registration_form_id_fkey"
            columns: ["registration_form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_survey_form_id_fkey"
            columns: ["survey_form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_survey_template_id_fkey"
            columns: ["survey_template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          created_at: string | null
          family_unit_id: string | null
          id: string
          linked_by: string | null
          member_id: string | null
          relation: string
        }
        Insert: {
          created_at?: string | null
          family_unit_id?: string | null
          id?: string
          linked_by?: string | null
          member_id?: string | null
          relation: string
        }
        Update: {
          created_at?: string | null
          family_unit_id?: string | null
          id?: string
          linked_by?: string | null
          member_id?: string | null
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_unit_id_fkey"
            columns: ["family_unit_id"]
            isOneToOne: false
            referencedRelation: "family_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      family_units: {
        Row: {
          created_at: string | null
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      finance_request_status_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          from_status: string | null
          id: string
          notes: string | null
          request_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          request_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          request_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_request_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_request_status_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "finance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_requests: {
        Row: {
          amount: number | null
          created_at: string | null
          entity_type: string | null
          event_id: string | null
          id: string
          member_id: string
          payment_id: string | null
          plan_id: string | null
          reason: string
          recorded_by: string | null
          request_type: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          study_group_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          entity_type?: string | null
          event_id?: string | null
          id?: string
          member_id: string
          payment_id?: string | null
          plan_id?: string | null
          reason: string
          recorded_by?: string | null
          request_type: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          study_group_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          entity_type?: string | null
          event_id?: string | null
          id?: string
          member_id?: string
          payment_id?: string | null
          plan_id?: string | null
          reason?: string
          recorded_by?: string | null
          request_type?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          study_group_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_requests_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_requests_study_group_id_fkey"
            columns: ["study_group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      folleto_requests: {
        Row: {
          available_at: string
          bloque_id: string | null
          close_date: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          id: string
          note: string | null
          origin_group_id: string | null
          quantity: number
          quantity_leaders: number | null
          sede: string | null
          source_group_id: string | null
          source_plan_code: string | null
          status: string
          target_leader_id: string | null
          target_leader_name: string | null
          target_level_code: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          available_at: string
          bloque_id?: string | null
          close_date: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          origin_group_id?: string | null
          quantity?: number
          quantity_leaders?: number | null
          sede?: string | null
          source_group_id?: string | null
          source_plan_code?: string | null
          status?: string
          target_leader_id?: string | null
          target_leader_name?: string | null
          target_level_code?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Update: {
          available_at?: string
          bloque_id?: string | null
          close_date?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          origin_group_id?: string | null
          quantity?: number
          quantity_leaders?: number | null
          sede?: string | null
          source_group_id?: string | null
          source_plan_code?: string | null
          status?: string
          target_leader_id?: string | null
          target_leader_name?: string | null
          target_level_code?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folleto_requests_origin_group_id_fkey"
            columns: ["origin_group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folleto_requests_bloque_id_fkey"
            columns: ["bloque_id"]
            isOneToOne: false
            referencedRelation: "capacitacion_bloques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folleto_requests_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folleto_requests_source_group_id_fkey"
            columns: ["source_group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folleto_requests_target_leader_id_fkey"
            columns: ["target_leader_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      form_access_grants: {
        Row: {
          form_id: string
          granted_at: string
          granted_by: string | null
          id: string
          member_id: string
        }
        Insert: {
          form_id: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          member_id: string
        }
        Update: {
          form_id?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_access_grants_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_access_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_access_grants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          conditions: Json | null
          created_at: string | null
          description: string | null
          field_type: string
          form_id: string
          help_text: string | null
          id: string
          is_required: boolean | null
          label: string
          options: Json | null
          options_source: string | null
          options_source_param: string | null
          placeholder: string | null
          scale_max: number | null
          scale_max_label: string | null
          scale_min: number | null
          scale_min_label: string | null
          sort_order: number | null
        }
        Insert: {
          conditions?: Json | null
          created_at?: string | null
          description?: string | null
          field_type: string
          form_id: string
          help_text?: string | null
          id?: string
          is_required?: boolean | null
          label: string
          options?: Json | null
          options_source?: string | null
          options_source_param?: string | null
          placeholder?: string | null
          scale_max?: number | null
          scale_max_label?: string | null
          scale_min?: number | null
          scale_min_label?: string | null
          sort_order?: number | null
        }
        Update: {
          conditions?: Json | null
          created_at?: string | null
          description?: string | null
          field_type?: string
          form_id?: string
          help_text?: string | null
          id?: string
          is_required?: boolean | null
          label?: string
          options?: Json | null
          options_source?: string | null
          options_source_param?: string | null
          placeholder?: string | null
          scale_max?: number | null
          scale_max_label?: string | null
          scale_min?: number | null
          scale_min_label?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_response_reviews: {
        Row: {
          broadcast_id: string | null
          created_at: string
          form_id: string
          id: string
          invitation_id: string | null
          invited_at: string | null
          notes: string | null
          response_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          broadcast_id?: string | null
          created_at?: string
          form_id: string
          id?: string
          invitation_id?: string | null
          invited_at?: string | null
          notes?: string | null
          response_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          broadcast_id?: string | null
          created_at?: string
          form_id?: string
          id?: string
          invitation_id?: string | null
          invited_at?: string | null
          notes?: string | null
          response_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_response_reviews_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "message_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_reviews_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_reviews_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "study_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_reviews_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: true
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      form_response_values: {
        Row: {
          created_at: string | null
          field_id: string
          id: string
          response_id: string
          value_json: Json | null
          value_text: string | null
        }
        Insert: {
          created_at?: string | null
          field_id: string
          id?: string
          response_id: string
          value_json?: Json | null
          value_text?: string | null
        }
        Update: {
          created_at?: string | null
          field_id?: string
          id?: string
          response_id?: string
          value_json?: Json | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_response_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_response_values_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      form_responses: {
        Row: {
          form_id: string
          guest_email: string | null
          guest_name: string | null
          id: string
          ip_address: unknown
          member_id: string | null
          recorded_by: string | null
          submitted_at: string | null
        }
        Insert: {
          form_id: string
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          ip_address?: unknown
          member_id?: string | null
          recorded_by?: string | null
          submitted_at?: string | null
        }
        Update: {
          form_id?: string
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          ip_address?: unknown
          member_id?: string | null
          recorded_by?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_responses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          allow_multiple_responses: boolean | null
          assignment_notified_key: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          ends_at: string | null
          entity_id: string | null
          entity_type: string | null
          hero_image_url: string | null
          hero_subtitle: string | null
          hero_title: string | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          requires_auth: boolean | null
          slug: string | null
          starts_at: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          allow_multiple_responses?: boolean | null
          assignment_notified_key?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          hero_image_url?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          requires_auth?: boolean | null
          slug?: string | null
          starts_at?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          allow_multiple_responses?: boolean | null
          assignment_notified_key?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          hero_image_url?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          requires_auth?: boolean | null
          slug?: string | null
          starts_at?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          created_at: string | null
          duplicates: number | null
          filename: string
          id: string
          identified: number | null
          imported_at: string | null
          imported_by: string | null
          status: string
          total_rows: number | null
          unidentified: number | null
        }
        Insert: {
          created_at?: string | null
          duplicates?: number | null
          filename: string
          id?: string
          identified?: number | null
          imported_at?: string | null
          imported_by?: string | null
          status?: string
          total_rows?: number | null
          unidentified?: number | null
        }
        Update: {
          created_at?: string | null
          duplicates?: number | null
          filename?: string
          id?: string
          identified?: number | null
          imported_at?: string | null
          imported_by?: string | null
          status?: string
          total_rows?: number | null
          unidentified?: number | null
        }
        Relationships: []
      }
      internal_notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          link: string | null
          read: boolean | null
          recipient_member_id: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          link?: string | null
          read?: boolean | null
          recipient_member_id: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          link?: string | null
          read?: boolean | null
          recipient_member_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notifications_recipient_member_id_fkey"
            columns: ["recipient_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      leader_evaluations: {
        Row: {
          co_leader_id: string | null
          comments: string | null
          created_at: string | null
          evaluation_date: string
          group_id: string | null
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          leader_id: string
          member_id: string | null
          response_id: string | null
          score: number
        }
        Insert: {
          co_leader_id?: string | null
          comments?: string | null
          created_at?: string | null
          evaluation_date?: string
          group_id?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          leader_id: string
          member_id?: string | null
          response_id?: string | null
          score: number
        }
        Update: {
          co_leader_id?: string | null
          comments?: string | null
          created_at?: string | null
          evaluation_date?: string
          group_id?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          leader_id?: string
          member_id?: string | null
          response_id?: string | null
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "leader_evaluations_co_leader_id_fkey"
            columns: ["co_leader_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leader_evaluations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leader_evaluations_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leader_evaluations_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "study_leaders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leader_evaluations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leader_evaluations_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "form_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      leader_report_history: {
        Row: {
          activos: number
          captured_on: string
          created_at: string
          dando_ahora: number
          disponibles_sin_grupo: number
          en_pausa: number
          en_revision: number
          total: number
        }
        Insert: {
          activos: number
          captured_on?: string
          created_at?: string
          dando_ahora: number
          disponibles_sin_grupo: number
          en_pausa?: number
          en_revision?: number
          total?: number
        }
        Update: {
          activos?: number
          captured_on?: string
          created_at?: string
          dando_ahora?: number
          disponibles_sin_grupo?: number
          en_pausa?: number
          en_revision?: number
          total?: number
        }
        Relationships: []
      }
      member_admin_data: {
        Row: {
          authorized_virtual_studies: boolean
          authorized_virtual_studies_at: string | null
          authorized_virtual_studies_by: string | null
          member_id: string
          not_recommended_reason: string | null
          not_recommended_to_lead_studies: boolean
          not_recommended_to_lead_studies_at: string | null
          not_recommended_to_lead_studies_by: string | null
          servers_onboarding: boolean
          servers_onboarding_at: string | null
          servers_onboarding_by: string | null
          updated_at: string
        }
        Insert: {
          authorized_virtual_studies?: boolean
          authorized_virtual_studies_at?: string | null
          authorized_virtual_studies_by?: string | null
          member_id: string
          not_recommended_reason?: string | null
          not_recommended_to_lead_studies?: boolean
          not_recommended_to_lead_studies_at?: string | null
          not_recommended_to_lead_studies_by?: string | null
          servers_onboarding?: boolean
          servers_onboarding_at?: string | null
          servers_onboarding_by?: string | null
          updated_at?: string
        }
        Update: {
          authorized_virtual_studies?: boolean
          authorized_virtual_studies_at?: string | null
          authorized_virtual_studies_by?: string | null
          member_id?: string
          not_recommended_reason?: string | null
          not_recommended_to_lead_studies?: boolean
          not_recommended_to_lead_studies_at?: string | null
          not_recommended_to_lead_studies_by?: string | null
          servers_onboarding?: boolean
          servers_onboarding_at?: string | null
          servers_onboarding_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_admin_data_authorized_virtual_studies_by_fkey"
            columns: ["authorized_virtual_studies_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_admin_data_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_admin_data_not_recommended_to_lead_studies_by_fkey"
            columns: ["not_recommended_to_lead_studies_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_admin_data_servers_onboarding_by_fkey"
            columns: ["servers_onboarding_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_lists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          filters: Json | null
          id: string
          is_dynamic: boolean
          last_used_at: string | null
          member_count: number
          member_ids: Json
          name: string
          segment_label: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json | null
          id?: string
          is_dynamic?: boolean
          last_used_at?: string | null
          member_count?: number
          member_ids?: Json
          name: string
          segment_label?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json | null
          id?: string
          is_dynamic?: boolean
          last_used_at?: string | null
          member_count?: number
          member_ids?: Json
          name?: string
          segment_label?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_notification_prefs: {
        Row: {
          canal_preferido: string
          grupo_estudio: boolean
          member_id: string
          mensajes_sistema: boolean
          recordatorios_eventos: boolean
          updated_at: string
        }
        Insert: {
          canal_preferido?: string
          grupo_estudio?: boolean
          member_id: string
          mensajes_sistema?: boolean
          recordatorios_eventos?: boolean
          updated_at?: string
        }
        Update: {
          canal_preferido?: string
          grupo_estudio?: boolean
          member_id?: string
          mensajes_sistema?: boolean
          recordatorios_eventos?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_notification_prefs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_recommendations: {
        Row: {
          created_at: string | null
          id: string
          justification: string | null
          member_id: string
          recommended_by: string | null
          recommended_for: string
          study_group_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          justification?: string | null
          member_id: string
          recommended_by?: string | null
          recommended_for: string
          study_group_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          justification?: string | null
          member_id?: string
          recommended_by?: string | null
          recommended_for?: string
          study_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_recommendations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_recommendations_recommended_by_fkey"
            columns: ["recommended_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_recommendations_study_group_id_fkey"
            columns: ["study_group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      member_role_position_grants: {
        Row: {
          granted_at: string
          id: string
          member_id: string
          position_id: string
          role: string
        }
        Insert: {
          granted_at?: string
          id?: string
          member_id: string
          position_id: string
          role: string
        }
        Update: {
          granted_at?: string
          id?: string
          member_id?: string
          position_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_role_position_grants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_role_position_grants_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "service_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      member_roles: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          is_active: boolean | null
          member_id: string | null
          origen: string
          revoked_at: string | null
          revoked_by: string | null
          role: string
          status_detail: string | null
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          member_id?: string | null
          origen?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role: string
          status_detail?: string | null
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          member_id?: string | null
          origen?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          status_detail?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_roles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_spiritual_data: {
        Row: {
          baptism_date: string | null
          baptism_place: string | null
          member_id: string
          spiritual_gifts: string | null
          updated_at: string
        }
        Insert: {
          baptism_date?: string | null
          baptism_place?: string | null
          member_id: string
          spiritual_gifts?: string | null
          updated_at?: string
        }
        Update: {
          baptism_date?: string | null
          baptism_place?: string | null
          member_id?: string
          spiritual_gifts?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_spiritual_data_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          account_confirmed_at: string | null
          address: string | null
          allergies: string | null
          auth_user_id: string | null
          birth_date: string | null
          canton: string | null
          cedula: string | null
          cedula_dup_legacy: boolean
          cedula_normalized: string | null
          created_at: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          district: string | null
          document_type: string
          email: string | null
          email_bounced: boolean | null
          email_bounced_at: string | null
          email_complained: boolean | null
          email_complained_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          external_id: string | null
          field_updated_at: Json | null
          first_name: string
          gender: string | null
          id: string
          is_active: boolean | null
          is_donor: boolean | null
          is_system: boolean
          last_name: string
          last_sign_in_at: string | null
          marital_status: string | null
          medications: string | null
          newsletter_opt_out: boolean | null
          newsletter_opt_out_at: string | null
          occupation: string | null
          phone: string | null
          photo_url: string | null
          province: string | null
          search_text: string | null
          sede_case: string | null
          sede_id: string | null
          sede_last_checkin: string | null
          smart_link_token: string | null
          unsubscribe_token: string
          updated_at: string | null
          wallet_pass_id: string | null
          workplace: string | null
        }
        Insert: {
          account_confirmed_at?: string | null
          address?: string | null
          allergies?: string | null
          auth_user_id?: string | null
          birth_date?: string | null
          canton?: string | null
          cedula?: string | null
          cedula_dup_legacy?: boolean
          cedula_normalized?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          district?: string | null
          document_type?: string
          email?: string | null
          email_bounced?: boolean | null
          email_bounced_at?: string | null
          email_complained?: boolean | null
          email_complained_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          external_id?: string | null
          field_updated_at?: Json | null
          first_name: string
          gender?: string | null
          id?: string
          is_active?: boolean | null
          is_donor?: boolean | null
          is_system?: boolean
          last_name: string
          last_sign_in_at?: string | null
          marital_status?: string | null
          medications?: string | null
          newsletter_opt_out?: boolean | null
          newsletter_opt_out_at?: string | null
          occupation?: string | null
          phone?: string | null
          photo_url?: string | null
          province?: string | null
          search_text?: string | null
          sede_case?: string | null
          sede_id?: string | null
          sede_last_checkin?: string | null
          smart_link_token?: string | null
          unsubscribe_token?: string
          updated_at?: string | null
          wallet_pass_id?: string | null
          workplace?: string | null
        }
        Update: {
          account_confirmed_at?: string | null
          address?: string | null
          allergies?: string | null
          auth_user_id?: string | null
          birth_date?: string | null
          canton?: string | null
          cedula?: string | null
          cedula_dup_legacy?: boolean
          cedula_normalized?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          district?: string | null
          document_type?: string
          email?: string | null
          email_bounced?: boolean | null
          email_bounced_at?: string | null
          email_complained?: boolean | null
          email_complained_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          external_id?: string | null
          field_updated_at?: Json | null
          first_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean | null
          is_donor?: boolean | null
          is_system?: boolean
          last_name?: string
          last_sign_in_at?: string | null
          marital_status?: string | null
          medications?: string | null
          newsletter_opt_out?: boolean | null
          newsletter_opt_out_at?: string | null
          occupation?: string | null
          phone?: string | null
          photo_url?: string | null
          province?: string | null
          search_text?: string | null
          sede_case?: string | null
          sede_id?: string | null
          sede_last_checkin?: string | null
          smart_link_token?: string | null
          unsubscribe_token?: string
          updated_at?: string | null
          wallet_pass_id?: string | null
          workplace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      message_broadcasts: {
        Row: {
          body: string
          body_format: string
          channel: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          failed_count: number | null
          id: string
          kind: string
          recipient_filter: Json | null
          scheduled_at: string | null
          segment_label: string | null
          sent_count: number | null
          skipped_count: number | null
          smtp_config_id: string | null
          started_at: string | null
          status: string | null
          subject: string | null
          template_id: string | null
          total_recipients: number | null
          updated_at: string | null
          whatsapp_config_id: string | null
        }
        Insert: {
          body: string
          body_format?: string
          channel: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          failed_count?: number | null
          id?: string
          kind?: string
          recipient_filter?: Json | null
          scheduled_at?: string | null
          segment_label?: string | null
          sent_count?: number | null
          skipped_count?: number | null
          smtp_config_id?: string | null
          started_at?: string | null
          status?: string | null
          subject?: string | null
          template_id?: string | null
          total_recipients?: number | null
          updated_at?: string | null
          whatsapp_config_id?: string | null
        }
        Update: {
          body?: string
          body_format?: string
          channel?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          failed_count?: number | null
          id?: string
          kind?: string
          recipient_filter?: Json | null
          scheduled_at?: string | null
          segment_label?: string | null
          sent_count?: number | null
          skipped_count?: number | null
          smtp_config_id?: string | null
          started_at?: string | null
          status?: string | null
          subject?: string | null
          template_id?: string | null
          total_recipients?: number | null
          updated_at?: string | null
          whatsapp_config_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_broadcasts_smtp_config_id_fkey"
            columns: ["smtp_config_id"]
            isOneToOne: false
            referencedRelation: "channel_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_broadcasts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_broadcasts_whatsapp_config_id_fkey"
            columns: ["whatsapp_config_id"]
            isOneToOne: false
            referencedRelation: "channel_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      message_logs: {
        Row: {
          attempts: number | null
          broadcast_id: string | null
          channel: string
          claimed_at: string | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          last_error: string | null
          member_id: string | null
          provider_message_id: string | null
          recipient: string
          scheduled_date: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          attempts?: number | null
          broadcast_id?: string | null
          channel: string
          claimed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          last_error?: string | null
          member_id?: string | null
          provider_message_id?: string | null
          recipient: string
          scheduled_date?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          attempts?: number | null
          broadcast_id?: string | null
          channel?: string
          claimed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          last_error?: string | null
          member_id?: string | null
          provider_message_id?: string | null
          recipient?: string
          scheduled_date?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "message_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          available_variables: Json | null
          body: string
          body_format: string
          category: string | null
          channel: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          is_system: boolean
          name: string
          subject: string | null
          system_key: string | null
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          available_variables?: Json | null
          body: string
          body_format?: string
          category?: string | null
          channel: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean
          name: string
          subject?: string | null
          system_key?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          available_variables?: Json | null
          body?: string
          body_format?: string
          category?: string | null
          channel?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean
          name?: string
          subject?: string | null
          system_key?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      notice_dismissals: {
        Row: {
          dismissed_at: string
          member_id: string
          notice_key: string
        }
        Insert: {
          dismissed_at?: string
          member_id: string
          notice_key: string
        }
        Update: {
          dismissed_at?: string
          member_id?: string
          notice_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notice_dismissals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_positions: {
        Row: {
          committee_id: string | null
          contract_type: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          salary_max: number | null
          salary_min: number | null
          updated_at: string | null
        }
        Insert: {
          committee_id?: string | null
          contract_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          salary_max?: number | null
          salary_min?: number | null
          updated_at?: string | null
        }
        Update: {
          committee_id?: string | null
          contract_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          salary_max?: number | null
          salary_min?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paid_positions_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_donation: boolean | null
          name: string
          type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_donation?: boolean | null
          name: string
          type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_donation?: boolean | null
          name?: string
          type?: string
        }
        Relationships: []
      }
      payment_plans: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          enrollment_id: string | null
          event_registration_id: string | null
          id: string
          installments: number
          member_id: string
          notes: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          enrollment_id?: string | null
          event_registration_id?: string | null
          id?: string
          installments: number
          member_id: string
          notes?: string | null
          status?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          enrollment_id?: string | null
          event_registration_id?: string | null
          id?: string
          installments?: number
          member_id?: string
          notes?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "study_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_event_registration_id_fkey"
            columns: ["event_registration_id"]
            isOneToOne: false
            referencedRelation: "event_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          category_id: string | null
          concept: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          due_date: string | null
          enrollment_id: string | null
          entity_type: string | null
          event_id: string | null
          event_registration_id: string | null
          folleto_request_id: string | null
          gateway_ref: string | null
          id: string
          installment_number: number | null
          member_id: string | null
          paid_at: string | null
          payment_date: string
          payment_method: string | null
          payment_plan_id: string | null
          receipt_path: string | null
          recorded_by: string | null
          reference_code: string | null
          rejection_reason: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scholarship: boolean | null
          scholarship_id: string | null
          scholarship_reason: string | null
          sinpe_confirmation: string | null
          status: string | null
          study_group_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          category_id?: string | null
          concept?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          due_date?: string | null
          enrollment_id?: string | null
          entity_type?: string | null
          event_id?: string | null
          event_registration_id?: string | null
          folleto_request_id?: string | null
          gateway_ref?: string | null
          id?: string
          installment_number?: number | null
          member_id?: string | null
          paid_at?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_plan_id?: string | null
          receipt_path?: string | null
          recorded_by?: string | null
          reference_code?: string | null
          rejection_reason?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scholarship?: boolean | null
          scholarship_id?: string | null
          scholarship_reason?: string | null
          sinpe_confirmation?: string | null
          status?: string | null
          study_group_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          concept?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          due_date?: string | null
          enrollment_id?: string | null
          entity_type?: string | null
          event_id?: string | null
          event_registration_id?: string | null
          folleto_request_id?: string | null
          gateway_ref?: string | null
          id?: string
          installment_number?: number | null
          member_id?: string | null
          paid_at?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_plan_id?: string | null
          receipt_path?: string | null
          recorded_by?: string | null
          reference_code?: string | null
          rejection_reason?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scholarship?: boolean | null
          scholarship_id?: string | null
          scholarship_reason?: string | null
          sinpe_confirmation?: string | null
          status?: string | null
          study_group_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "payment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "study_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_event_registration_id_fkey"
            columns: ["event_registration_id"]
            isOneToOne: false
            referencedRelation: "event_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_folleto_request_id_fkey"
            columns: ["folleto_request_id"]
            isOneToOne: false
            referencedRelation: "folleto_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_scholarship_id_fkey"
            columns: ["scholarship_id"]
            isOneToOne: false
            referencedRelation: "scholarships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_study_group_id_fkey"
            columns: ["study_group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      position_records: {
        Row: {
          contract_type: string | null
          created_at: string | null
          employee_id: string
          end_date: string | null
          id: string
          position_name: string
          start_date: string | null
        }
        Insert: {
          contract_type?: string | null
          created_at?: string | null
          employee_id: string
          end_date?: string | null
          id?: string
          position_name: string
          start_date?: string | null
        }
        Update: {
          contract_type?: string | null
          created_at?: string | null
          employee_id?: string
          end_date?: string | null
          id?: string
          position_name?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "position_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      position_requests: {
        Row: {
          committee_id: string
          created_at: string | null
          created_position_id: string | null
          description: string | null
          functions: string | null
          id: string
          profile: string | null
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          study_requirement: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          committee_id: string
          created_at?: string | null
          created_position_id?: string | null
          description?: string | null
          functions?: string | null
          id?: string
          profile?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          study_requirement?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          committee_id?: string
          created_at?: string | null
          created_position_id?: string | null
          description?: string | null
          functions?: string | null
          id?: string
          profile?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          study_requirement?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "position_requests_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_requests_created_position_id_fkey"
            columns: ["created_position_id"]
            isOneToOne: false
            referencedRelation: "service_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      prematrimonial_evaluations: {
        Row: {
          action_plan: string
          blessing: string | null
          blind_spot: boolean
          blind_spot_notes: string | null
          commitment: string
          created_at: string
          filled_by: string | null
          group_id: string
          id: string
          observations: string | null
          request_id: string
          strengths: string[]
          strengths_notes: string | null
          topics_to_work: string[]
        }
        Insert: {
          action_plan: string
          blessing?: string | null
          blind_spot?: boolean
          blind_spot_notes?: string | null
          commitment: string
          created_at?: string
          filled_by?: string | null
          group_id: string
          id?: string
          observations?: string | null
          request_id: string
          strengths?: string[]
          strengths_notes?: string | null
          topics_to_work?: string[]
        }
        Update: {
          action_plan?: string
          blessing?: string | null
          blind_spot?: boolean
          blind_spot_notes?: string | null
          commitment?: string
          created_at?: string
          filled_by?: string | null
          group_id?: string
          id?: string
          observations?: string | null
          request_id?: string
          strengths?: string[]
          strengths_notes?: string | null
          topics_to_work?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "prematrimonial_evaluations_filled_by_fkey"
            columns: ["filled_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prematrimonial_evaluations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prematrimonial_evaluations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "prematrimonial_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      prematrimonial_request_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          notes: string | null
          request_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          request_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          request_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "prematrimonial_request_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prematrimonial_request_status_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "prematrimonial_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      prematrimonial_requests: {
        Row: {
          available_days: string[]
          available_times: string[]
          can_host: boolean
          cancel_reason: string | null
          canceled_by: string | null
          ceremony_date: string | null
          ceremony_date_defined: boolean
          children_ages: string | null
          comments: string | null
          created_at: string
          created_by: string | null
          dating_time: string | null
          diagnostic_notes: string | null
          first_marriage: boolean | null
          has_children: boolean | null
          host_address: string | null
          host_maps_url: string | null
          id: string
          living_arrangement: string | null
          officiant: string | null
          payment_id: string | null
          previous_marriage_notes: string | null
          refund_request_id: string | null
          requester_member_id: string
          resulting_group_id: string | null
          reviewed_by: string | null
          spouse_member_id: string
          status: string
          updated_at: string
          venue_defined: boolean
          venue_outside_gam: boolean
          zones: string[]
        }
        Insert: {
          available_days?: string[]
          available_times?: string[]
          can_host?: boolean
          cancel_reason?: string | null
          canceled_by?: string | null
          ceremony_date?: string | null
          ceremony_date_defined?: boolean
          children_ages?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          dating_time?: string | null
          diagnostic_notes?: string | null
          first_marriage?: boolean | null
          has_children?: boolean | null
          host_address?: string | null
          host_maps_url?: string | null
          id?: string
          living_arrangement?: string | null
          officiant?: string | null
          payment_id?: string | null
          previous_marriage_notes?: string | null
          refund_request_id?: string | null
          requester_member_id: string
          resulting_group_id?: string | null
          reviewed_by?: string | null
          spouse_member_id: string
          status?: string
          updated_at?: string
          venue_defined?: boolean
          venue_outside_gam?: boolean
          zones?: string[]
        }
        Update: {
          available_days?: string[]
          available_times?: string[]
          can_host?: boolean
          cancel_reason?: string | null
          canceled_by?: string | null
          ceremony_date?: string | null
          ceremony_date_defined?: boolean
          children_ages?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          dating_time?: string | null
          diagnostic_notes?: string | null
          first_marriage?: boolean | null
          has_children?: boolean | null
          host_address?: string | null
          host_maps_url?: string | null
          id?: string
          living_arrangement?: string | null
          officiant?: string | null
          payment_id?: string | null
          previous_marriage_notes?: string | null
          refund_request_id?: string | null
          requester_member_id?: string
          resulting_group_id?: string | null
          reviewed_by?: string | null
          spouse_member_id?: string
          status?: string
          updated_at?: string
          venue_defined?: boolean
          venue_outside_gam?: boolean
          zones?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "prematrimonial_requests_canceled_by_fkey"
            columns: ["canceled_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prematrimonial_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prematrimonial_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prematrimonial_requests_refund_request_id_fkey"
            columns: ["refund_request_id"]
            isOneToOne: false
            referencedRelation: "finance_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prematrimonial_requests_requester_member_id_fkey"
            columns: ["requester_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prematrimonial_requests_resulting_group_id_fkey"
            columns: ["resulting_group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prematrimonial_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prematrimonial_requests_spouse_member_id_fkey"
            columns: ["spouse_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          member_id: string | null
          refund_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          member_id?: string | null
          refund_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          member_id?: string | null
          refund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_comments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_comments_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          created_at: string | null
          currency: string
          event_id: string | null
          id: string
          kind: string | null
          member_id: string | null
          method: string | null
          notes: string | null
          payment_id: string
          plan_id: string | null
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          requested_at: string | null
          sinpe_pending: boolean | null
          status: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string
          event_id?: string | null
          id?: string
          kind?: string | null
          member_id?: string | null
          method?: string | null
          notes?: string | null
          payment_id: string
          plan_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_at?: string | null
          sinpe_pending?: boolean | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string
          event_id?: string | null
          id?: string
          kind?: string | null
          member_id?: string | null
          method?: string | null
          notes?: string | null
          payment_id?: string
          plan_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_at?: string | null
          sinpe_pending?: boolean | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      report_snapshots: {
        Row: {
          data: Json
          report_key: string
          row_count: number | null
          updated_at: string
        }
        Insert: {
          data: Json
          report_key: string
          row_count?: number | null
          updated_at?: string
        }
        Update: {
          data?: Json
          report_key?: string
          row_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      salary_changes: {
        Row: {
          approved_by: string | null
          change_date: string
          created_at: string | null
          employee_id: string
          id: string
          new_salary: number
          previous_salary: number | null
          reason: string | null
        }
        Insert: {
          approved_by?: string | null
          change_date?: string
          created_at?: string | null
          employee_id: string
          id?: string
          new_salary: number
          previous_salary?: number | null
          reason?: string | null
        }
        Update: {
          approved_by?: string | null
          change_date?: string
          created_at?: string | null
          employee_id?: string
          id?: string
          new_salary?: number
          previous_salary?: number | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_changes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      scholarship_redemptions: {
        Row: {
          enrollment_id: string | null
          event_registration_id: string | null
          final_amount: number
          id: string
          member_id: string
          redeemed_at: string
          scholarship_id: string
        }
        Insert: {
          enrollment_id?: string | null
          event_registration_id?: string | null
          final_amount: number
          id?: string
          member_id: string
          redeemed_at?: string
          scholarship_id: string
        }
        Update: {
          enrollment_id?: string | null
          event_registration_id?: string | null
          final_amount?: number
          id?: string
          member_id?: string
          redeemed_at?: string
          scholarship_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scholarship_redemptions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "study_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_redemptions_event_registration_id_fkey"
            columns: ["event_registration_id"]
            isOneToOne: false
            referencedRelation: "event_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_redemptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarship_redemptions_scholarship_id_fkey"
            columns: ["scholarship_id"]
            isOneToOne: false
            referencedRelation: "scholarships"
            referencedColumns: ["id"]
          },
        ]
      }
      scholarships: {
        Row: {
          amount: number | null
          approval_type: string | null
          approved_at: string | null
          approved_by: string | null
          code: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          discount_type: string | null
          discount_value: number | null
          email_sent_at: string | null
          email_sent_to: string | null
          entity_type: string | null
          event_id: string | null
          expires_at: string | null
          final_amount: number | null
          id: string
          is_used: boolean | null
          kind: string
          member_id: string | null
          notes: string | null
          original_amount: number | null
          plan_id: string | null
          reason: string | null
          request_id: string | null
          status: string | null
          updated_at: string | null
          used_at: string | null
        }
        Insert: {
          amount?: number | null
          approval_type?: string | null
          approved_at?: string | null
          approved_by?: string | null
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          discount_type?: string | null
          discount_value?: number | null
          email_sent_at?: string | null
          email_sent_to?: string | null
          entity_type?: string | null
          event_id?: string | null
          expires_at?: string | null
          final_amount?: number | null
          id?: string
          is_used?: boolean | null
          kind?: string
          member_id?: string | null
          notes?: string | null
          original_amount?: number | null
          plan_id?: string | null
          reason?: string | null
          request_id?: string | null
          status?: string | null
          updated_at?: string | null
          used_at?: string | null
        }
        Update: {
          amount?: number | null
          approval_type?: string | null
          approved_at?: string | null
          approved_by?: string | null
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          discount_type?: string | null
          discount_value?: number | null
          email_sent_at?: string | null
          email_sent_to?: string | null
          entity_type?: string | null
          event_id?: string | null
          expires_at?: string | null
          final_amount?: number | null
          id?: string
          is_used?: boolean | null
          kind?: string
          member_id?: string | null
          notes?: string | null
          original_amount?: number | null
          plan_id?: string | null
          reason?: string | null
          request_id?: string | null
          status?: string | null
          updated_at?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scholarships_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarships_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "finance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sedes: {
        Row: {
          age_group: string | null
          code: string
          created_at: string | null
          currency: string
          day: string | null
          id: string
          is_active: boolean | null
          is_historical: boolean | null
          is_zone: boolean
          location: string | null
          name: string
          time: string | null
          updated_at: string | null
          waze_url: string | null
        }
        Insert: {
          age_group?: string | null
          code: string
          created_at?: string | null
          currency?: string
          day?: string | null
          id?: string
          is_active?: boolean | null
          is_historical?: boolean | null
          is_zone?: boolean
          location?: string | null
          name: string
          time?: string | null
          updated_at?: string | null
          waze_url?: string | null
        }
        Update: {
          age_group?: string | null
          code?: string
          created_at?: string | null
          currency?: string
          day?: string | null
          id?: string
          is_active?: boolean | null
          is_historical?: boolean | null
          is_zone?: boolean
          location?: string | null
          name?: string
          time?: string | null
          updated_at?: string | null
          waze_url?: string | null
        }
        Relationships: []
      }
      service_positions: {
        Row: {
          area_id: string
          base_area_id: string | null
          created_at: string | null
          description: string | null
          expires_at: string | null
          functions: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          location: string | null
          max_volunteers: number | null
          profile: string | null
          quantity: number | null
          requirements: string | null
          skills: string | null
          study_requirement: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          area_id: string
          base_area_id?: string | null
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          functions?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          location?: string | null
          max_volunteers?: number | null
          profile?: string | null
          quantity?: number | null
          requirements?: string | null
          skills?: string | null
          study_requirement?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          area_id?: string
          base_area_id?: string | null
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          functions?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          location?: string | null
          max_volunteers?: number | null
          profile?: string | null
          quantity?: number | null
          requirements?: string | null
          skills?: string | null
          study_requirement?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_positions_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_positions_base_area_id_fkey"
            columns: ["base_area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      silenced_emails: {
        Row: {
          attempted_at: string
          id: string
          kind: string | null
          recipient: string
          subject: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          kind?: string | null
          recipient: string
          subject: string
        }
        Update: {
          attempted_at?: string
          id?: string
          kind?: string | null
          recipient?: string
          subject?: string
        }
        Relationships: []
      }
      study_attendance: {
        Row: {
          created_at: string | null
          id: string
          member_id: string
          notes: string | null
          present: boolean | null
          recorded_by: string | null
          session_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          member_id: string
          notes?: string | null
          present?: boolean | null
          recorded_by?: string | null
          session_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          member_id?: string
          notes?: string | null
          present?: boolean | null
          recorded_by?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      study_enrollments: {
        Row: {
          completed_at: string | null
          created_at: string | null
          drop_reason: string | null
          dropped_at: string | null
          enrolled_at: string | null
          es_externo: boolean
          fuente_externa: string | null
          grade: number | null
          group_id: string | null
          id: string
          member_id: string
          notes: string | null
          plan_id: string | null
          recorded_by: string | null
          status: string | null
          transferred_to: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          drop_reason?: string | null
          dropped_at?: string | null
          enrolled_at?: string | null
          es_externo?: boolean
          fuente_externa?: string | null
          grade?: number | null
          group_id?: string | null
          id?: string
          member_id: string
          notes?: string | null
          plan_id?: string | null
          recorded_by?: string | null
          status?: string | null
          transferred_to?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          drop_reason?: string | null
          dropped_at?: string | null
          enrolled_at?: string | null
          es_externo?: boolean
          fuente_externa?: string | null
          grade?: number | null
          group_id?: string | null
          id?: string
          member_id?: string
          notes?: string | null
          plan_id?: string | null
          recorded_by?: string | null
          status?: string | null
          transferred_to?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_enrollments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_enrollments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_enrollments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_enrollments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_enrollments_transferred_to_fkey"
            columns: ["transferred_to"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      study_groups: {
        Row: {
          age_max: number | null
          age_min: number | null
          bloque_id: string | null
          close_overdue_notified_at: string | null
          close_reminder_sent_at: string | null
          co_leader_id: string | null
          created_at: string | null
          current_week: number | null
          ends_at: string | null
          enrollment_end_date: string | null
          enrollment_restrictions: Json | null
          enrollment_start_date: string | null
          feedback_released_at: string | null
          feedback_released_by: string | null
          feedback_requested_at: string | null
          folletos_sede: string | null
          id: string
          is_leader_training: boolean | null
          is_virtual: boolean
          leader_id: string | null
          location: string | null
          max_students: number | null
          name: string
          plan_id: string
          schedule_days: string[] | null
          schedule_time: string | null
          sede: string | null
          start_notified_at: string | null
          starts_at: string | null
          status: string | null
          survey_enabled: boolean
          survey_form_id: string | null
          survey_offset_hours: number
          survey_send_at: string | null
          training_modality: string | null
          updated_at: string | null
          whatsapp_group_url: string | null
          zone: string | null
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          bloque_id?: string | null
          close_overdue_notified_at?: string | null
          close_reminder_sent_at?: string | null
          co_leader_id?: string | null
          created_at?: string | null
          current_week?: number | null
          ends_at?: string | null
          enrollment_end_date?: string | null
          enrollment_restrictions?: Json | null
          enrollment_start_date?: string | null
          feedback_released_at?: string | null
          feedback_released_by?: string | null
          feedback_requested_at?: string | null
          folletos_sede?: string | null
          id?: string
          is_leader_training?: boolean | null
          is_virtual?: boolean
          leader_id?: string | null
          location?: string | null
          max_students?: number | null
          name: string
          plan_id: string
          schedule_days?: string[] | null
          schedule_time?: string | null
          sede?: string | null
          start_notified_at?: string | null
          starts_at?: string | null
          status?: string | null
          survey_enabled?: boolean
          survey_form_id?: string | null
          survey_offset_hours?: number
          survey_send_at?: string | null
          training_modality?: string | null
          updated_at?: string | null
          whatsapp_group_url?: string | null
          zone?: string | null
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          bloque_id?: string | null
          close_overdue_notified_at?: string | null
          close_reminder_sent_at?: string | null
          co_leader_id?: string | null
          created_at?: string | null
          current_week?: number | null
          ends_at?: string | null
          enrollment_end_date?: string | null
          enrollment_restrictions?: Json | null
          enrollment_start_date?: string | null
          feedback_released_at?: string | null
          feedback_released_by?: string | null
          feedback_requested_at?: string | null
          folletos_sede?: string | null
          id?: string
          is_leader_training?: boolean | null
          is_virtual?: boolean
          leader_id?: string | null
          location?: string | null
          max_students?: number | null
          name?: string
          plan_id?: string
          schedule_days?: string[] | null
          schedule_time?: string | null
          sede?: string | null
          start_notified_at?: string | null
          starts_at?: string | null
          status?: string | null
          survey_enabled?: boolean
          survey_form_id?: string | null
          survey_offset_hours?: number
          survey_send_at?: string | null
          training_modality?: string | null
          updated_at?: string | null
          whatsapp_group_url?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_groups_bloque_id_fkey"
            columns: ["bloque_id"]
            isOneToOne: false
            referencedRelation: "capacitacion_bloques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_groups_co_leader_id_fkey"
            columns: ["co_leader_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_groups_feedback_released_by_fkey"
            columns: ["feedback_released_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_groups_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_groups_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_groups_survey_form_id_fkey"
            columns: ["survey_form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      study_invitations: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string | null
          member_id: string
          notes: string | null
          plan_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          member_id: string
          notes?: string | null
          plan_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          member_id?: string
          notes?: string | null
          plan_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_invitations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_invitations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      study_leaders: {
        Row: {
          availability_status: string | null
          created_at: string | null
          formation_study_codes: string[]
          id: string
          is_active: boolean | null
          member_id: string
          qualified_study_codes: string[] | null
          updated_at: string | null
          zone_preference: string[] | null
        }
        Insert: {
          availability_status?: string | null
          created_at?: string | null
          formation_study_codes?: string[]
          id?: string
          is_active?: boolean | null
          member_id: string
          qualified_study_codes?: string[] | null
          updated_at?: string | null
          zone_preference?: string[] | null
        }
        Update: {
          availability_status?: string | null
          created_at?: string | null
          formation_study_codes?: string[]
          id?: string
          is_active?: boolean | null
          member_id?: string
          qualified_study_codes?: string[] | null
          updated_at?: string | null
          zone_preference?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "study_leaders_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      study_plans: {
        Row: {
          auto_promote: boolean | null
          code: string | null
          commitments: string | null
          cost: number | null
          created_at: string | null
          currency: string
          description: string | null
          difficulty: string | null
          duration_weeks: number | null
          id: string
          is_active: boolean | null
          is_curricular: boolean
          level: string
          max_students: number | null
          mentor_id: string | null
          min_attendance_pct: number | null
          name: string
          next_study_code: string | null
          prerequisite_code: string | null
          requires_attendance: boolean | null
          requires_bus_talk: boolean
          requires_donor: boolean | null
          requires_grade: boolean | null
          requires_invitation: boolean
          requires_payment: boolean | null
          requires_server: boolean | null
          updated_at: string | null
        }
        Insert: {
          auto_promote?: boolean | null
          code?: string | null
          commitments?: string | null
          cost?: number | null
          created_at?: string | null
          currency?: string
          description?: string | null
          difficulty?: string | null
          duration_weeks?: number | null
          id?: string
          is_active?: boolean | null
          is_curricular?: boolean
          level: string
          max_students?: number | null
          mentor_id?: string | null
          min_attendance_pct?: number | null
          name: string
          next_study_code?: string | null
          prerequisite_code?: string | null
          requires_attendance?: boolean | null
          requires_bus_talk?: boolean
          requires_donor?: boolean | null
          requires_grade?: boolean | null
          requires_invitation?: boolean
          requires_payment?: boolean | null
          requires_server?: boolean | null
          updated_at?: string | null
        }
        Update: {
          auto_promote?: boolean | null
          code?: string | null
          commitments?: string | null
          cost?: number | null
          created_at?: string | null
          currency?: string
          description?: string | null
          difficulty?: string | null
          duration_weeks?: number | null
          id?: string
          is_active?: boolean | null
          is_curricular?: boolean
          level?: string
          max_students?: number | null
          mentor_id?: string | null
          min_attendance_pct?: number | null
          name?: string
          next_study_code?: string | null
          prerequisite_code?: string | null
          requires_attendance?: boolean | null
          requires_bus_talk?: boolean
          requires_donor?: boolean | null
          requires_grade?: boolean | null
          requires_invitation?: boolean
          requires_payment?: boolean | null
          requires_server?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_plans_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      study_request_status_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          from_status: string | null
          id: string
          notes: string | null
          request_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          request_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          request_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_request_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_request_status_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "study_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      study_requests: {
        Row: {
          created_at: string | null
          current_group_id: string | null
          eligibility_note: string | null
          existing_group_id: string | null
          id: string
          last_class_attended: string | null
          last_leader_name: string | null
          member_id: string
          needed_study_code: string | null
          plan_id: string | null
          proposed_days: string[]
          proposed_location: string | null
          proposed_schedule: string | null
          proposed_time: string | null
          proposed_zones: string[]
          reason: string | null
          recorded_by: string | null
          request_type: string
          resolved_group_id: string | null
          resulting_enrollment_id: string | null
          resulting_folleto_request_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string | null
          wants_folleto: boolean
          was_eligible: boolean | null
        }
        Insert: {
          created_at?: string | null
          current_group_id?: string | null
          eligibility_note?: string | null
          existing_group_id?: string | null
          id?: string
          last_class_attended?: string | null
          last_leader_name?: string | null
          member_id: string
          needed_study_code?: string | null
          plan_id?: string | null
          proposed_days?: string[]
          proposed_location?: string | null
          proposed_schedule?: string | null
          proposed_time?: string | null
          proposed_zones?: string[]
          reason?: string | null
          recorded_by?: string | null
          request_type: string
          resolved_group_id?: string | null
          resulting_enrollment_id?: string | null
          resulting_folleto_request_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          wants_folleto?: boolean
          was_eligible?: boolean | null
        }
        Update: {
          created_at?: string | null
          current_group_id?: string | null
          eligibility_note?: string | null
          existing_group_id?: string | null
          id?: string
          last_class_attended?: string | null
          last_leader_name?: string | null
          member_id?: string
          needed_study_code?: string | null
          plan_id?: string | null
          proposed_days?: string[]
          proposed_location?: string | null
          proposed_schedule?: string | null
          proposed_time?: string | null
          proposed_zones?: string[]
          reason?: string | null
          recorded_by?: string | null
          request_type?: string
          resolved_group_id?: string | null
          resulting_enrollment_id?: string | null
          resulting_folleto_request_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          wants_folleto?: boolean
          was_eligible?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "study_requests_current_group_id_fkey"
            columns: ["current_group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_requests_existing_group_id_fkey"
            columns: ["existing_group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_requests_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_requests_resolved_group_id_fkey"
            columns: ["resolved_group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_requests_resulting_enrollment_id_fkey"
            columns: ["resulting_enrollment_id"]
            isOneToOne: false
            referencedRelation: "study_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_requests_resulting_folleto_request_id_fkey"
            columns: ["resulting_folleto_request_id"]
            isOneToOne: false
            referencedRelation: "folleto_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      study_requirement_exceptions: {
        Row: {
          created_at: string | null
          granted_by: string | null
          id: string
          member_id: string
          plan_id: string
          reason: string
          revoked_at: string | null
          status: string
          waived_requirements: string[]
        }
        Insert: {
          created_at?: string | null
          granted_by?: string | null
          id?: string
          member_id: string
          plan_id: string
          reason: string
          revoked_at?: string | null
          status?: string
          waived_requirements?: string[]
        }
        Update: {
          created_at?: string | null
          granted_by?: string | null
          id?: string
          member_id?: string
          plan_id?: string
          reason?: string
          revoked_at?: string | null
          status?: string
          waived_requirements?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "study_requirement_exceptions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_requirement_exceptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_requirement_exceptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          created_at: string | null
          created_by: string | null
          group_id: string
          id: string
          notes: string | null
          session_date: string
          topic: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          group_id: string
          id?: string
          notes?: string | null
          session_date: string
          topic?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          group_id?: string
          id?: string
          notes?: string | null
          session_date?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_events: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          max_capacity: number
          name: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          max_capacity?: number
          name: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          max_capacity?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      vacancies: {
        Row: {
          commitment: string | null
          committee_id: string
          created_at: string | null
          description: string | null
          expires_at: string | null
          functions: string[] | null
          id: string
          is_featured: boolean
          location: string | null
          notes: string | null
          position: string | null
          position_id: string | null
          published_at: string | null
          schedule: string | null
          slots_filled: number | null
          slots_total: number | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          commitment?: string | null
          committee_id: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          functions?: string[] | null
          id?: string
          is_featured?: boolean
          location?: string | null
          notes?: string | null
          position?: string | null
          position_id?: string | null
          published_at?: string | null
          schedule?: string | null
          slots_filled?: number | null
          slots_total?: number | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          commitment?: string | null
          committee_id?: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          functions?: string[] | null
          id?: string
          is_featured?: boolean
          location?: string | null
          notes?: string | null
          position?: string | null
          position_id?: string | null
          published_at?: string | null
          schedule?: string | null
          slots_filled?: number | null
          slots_total?: number | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vacancies_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacancies_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "service_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      vacation_records: {
        Row: {
          created_at: string | null
          days: number
          employee_id: string
          end_date: string
          id: string
          notes: string | null
          start_date: string
          status: string
          type: string
        }
        Insert: {
          created_at?: string | null
          days?: number
          employee_id: string
          end_date: string
          id?: string
          notes?: string | null
          start_date: string
          status?: string
          type: string
        }
        Update: {
          created_at?: string | null
          days?: number
          employee_id?: string
          end_date?: string
          id?: string
          notes?: string | null
          start_date?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteers: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: string
          member_id: string
          notes: string | null
          position_id: string
          start_date: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          member_id: string
          notes?: string | null
          position_id: string
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          member_id?: string
          notes?: string | null
          position_id?: string
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "volunteers_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteers_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "service_positions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_attendance_member_ids: {
        Args: { p_min_count: number; p_oldest: string; p_recency_since: string }
        Returns: {
          member_id: string
        }[]
      }
      approve_applications: { Args: { app_ids: string[] }; Returns: number }
      approve_payment: {
        Args: { p_payment_id: string; p_reviewer?: string }
        Returns: boolean
      }
      block_folletos_by_sede: {
        Args: { p_apertura: string }
        Returns: {
          cantidad: number
          sede: string
        }[]
      }
      block_folletos_detail: {
        Args: { p_apertura: string }
        Returns: {
          cantidad: number
          dirigente: string
          grupo: string
          nivel: string
          nivel_code: string
          sede: string
        }[]
      }
      campaign_student_counts: {
        Args: never
        Returns: {
          grupos: number
          inscripciones: number
          unicos: number
        }[]
      }
      charla_sede_code: { Args: { p_title: string }; Returns: string }
      // Agregado a mano (migración 20260907210000): los tipos generados no lo
      // traen todavía. Primer check-in de cada miembro, para contar personas
      // nuevas en el detalle de un evento.
      members_first_checkin: {
        Args: { p_member_ids: string[] }
        Returns: { member_id: string; first_checkin_at: string }[]
      }
      close_payment_ticket: {
        Args: { p_payment_id: string; p_reviewer?: string | null; p_reason?: string | null }
        Returns: boolean
      }
      close_group: {
        Args: { p_closed_by?: string; p_group_id: string; p_results: Json }
        Returns: boolean
      }
      create_refund: {
        Args: {
          p_amount: number
          p_member_id: string
          p_method: string
          p_notes?: string
          p_payment_id: string
          p_reason: string
          p_sinpe_pending: boolean
        }
        Returns: Json
      }
      dashboard_sums: {
        Args: { p_month_start: string; p_month_start_date: string }
        Returns: {
          income_this_month: Json
          servers_unique: number
          total_recipients: number
        }[]
      }
      donation_stats: { Args: never; Returns: Json }
      find_duplicate_pairs: {
        Args: never
        Returns: {
          member_a: string
          member_b: string
          reasons: string[]
        }[]
      }
      get_active_today: {
        Args: { p_min: number; p_oldest: string }
        Returns: {
          member_id: string
        }[]
      }
      get_dm_flags: {
        Args: { p_min: number; p_oldest: string; p_recency: string }
        Returns: {
          cohort_year: number
          dona: boolean
          es_comprometido: boolean
          es_dm: boolean
          person_id: string
          sirve: boolean
        }[]
      }
      get_dm_milestones: {
        Args: { p_min: number }
        Returns: {
          avg_days: number
          milestone: string
          n: number
        }[]
      }
      get_group_attendance: {
        Args: never
        Returns: {
          grp: string
          max_age: number
          person_id: string
          visits: number
          yr: number
        }[]
      }
      grant_position_role: {
        Args: { p_member_id: string; p_position_id: string; p_role: string }
        Returns: undefined
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      increment_vacation_days_used: {
        Args: { p_delta: number; p_employee_id: string }
        Returns: undefined
      }
      merge_members: {
        Args: { dup_id: string; keep_id: string; soft?: boolean }
        Returns: undefined
      }
      payment_stats: { Args: never; Returns: Json }
      process_refund: {
        Args: {
          p_note?: string
          p_processed_at?: string
          p_refund_id: string
          p_status: string
        }
        Returns: Json
      }
      prune_audit_log: { Args: never; Returns: undefined }
      refresh_donor_flags: { Args: never; Returns: undefined }
      refresh_member_sede: { Args: { p_member_id: string }; Returns: undefined }
      refresh_member_sedes: { Args: never; Returns: undefined }
      register_for_event: {
        Args: { p_event_id: string; p_member_id: string }
        Returns: Json
      }
      report_charla_attendance: {
        Args: never
        Returns: {
          checkins: number
          mo: number
          title: string
          wk: number
          yr: number
        }[]
      }
      report_member_growth: {
        Args: never
        Returns: {
          created_mo: number
          created_yr: number
          new_members: number
          title: string
        }[]
      }
      revert_payment_approval: {
        Args: { p_payment_id: string; p_reason?: string; p_reviewer?: string }
        Returns: boolean
      }
      revoke_position_role: {
        Args: { p_member_id: string; p_position_id: string; p_role: string }
        Returns: undefined
      }
      study_dashboard_stats: {
        Args: never
        Returns: {
          categoria: string
          estado: string
          estudiantes: number
          grupos: number
        }[]
      }
      study_dashboard_stats_v2: {
        Args: never
        Returns: {
          categoria: string
          estado: string
          grupos: number
          inscripciones: number
          unicos: number
        }[]
      }
      submit_form_response: {
        Args: {
          p_answers: Json
          p_form_id: string
          p_guest_email: string
          p_guest_name: string
          p_member_id: string
          p_recorded_by?: string
        }
        Returns: string
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

