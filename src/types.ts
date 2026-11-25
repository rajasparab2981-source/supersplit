// Row shapes exactly as stored in Supabase / localStorage today.
// Amounts are rupees (numeric(12,2)); all maths converts to integer paise.

export interface Group {
  id: string;
  name: string;
  emoji: string;
  color: string;
  created_at: string;
}

export interface Member {
  id: string;
  group_id: string;
  name: string;
  created_at: string;
}

export interface Trip {
  id: string;
  group_id: string;
  name: string;
  emoji: string;
  created_at: string;
  // Smart Trip Planner details (absent on databases without the planner migration).
  destination?: string | null;
  start_location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  adults?: number | null;
  children?: number | null;
  travel_type?: string | null;
  travel_style?: string | null;
  status?: 'planning' | 'active' | 'completed';
  budget_minor?: number | null;
  buffer_pct?: number | null;
  alert_thresholds?: number[] | null;
  prefs?: Record<string, unknown> | null;
}

/** { memberName: rupees } for unequal splits; null/empty means equal split. */
export type Shares = Record<string, number>;
/** { memberName: emoji } */
export type Reactions = Record<string, string>;

export interface Expense {
  id: string;
  trip_id: string;
  description: string;
  amount: number;
  paid_by: string;
  split_among: string[];
  shares: Shares | null;
  reactions?: Reactions | null;
  image_url?: string | null;
  category: string;
  expense_date: string; // YYYY-MM-DD
  created_at: string;
}

export interface Snapshot {
  groups: Group[];
  members: Member[];
  trips: Trip[];
  expenses: Expense[];
}

export interface Balance {
  name: string;
  /** Rupees. Positive = is owed money, negative = owes. */
  net: number;
}

export interface Transfer {
  from: string;
  to: string;
  /** Rupees. */
  amount: number;
}
