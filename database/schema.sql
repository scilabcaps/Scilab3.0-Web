-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.rooms (
  room_id integer NOT NULL DEFAULT nextval('rooms_room_id_seq'::regclass),
  room_name character varying NOT NULL,
  capacity integer DEFAULT 30,
  status text NOT NULL DEFAULT 'Available'::text CHECK (status = ANY (ARRAY['Available'::text, 'Maintenance'::text, 'Occupied'::text, 'Over Time'::text])),
  is_deleted boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rooms_pkey PRIMARY KEY (room_id)
);
CREATE TABLE public.chemicals (
  chemical_id integer NOT NULL DEFAULT nextval('chemicals_chemical_id_seq'::regclass),
  chemical_name character varying NOT NULL,
  formula character varying,
  stock_quantity numeric DEFAULT 0 CHECK (stock_quantity >= 0::numeric),
  unit character varying DEFAULT 'mL'::character varying,
  is_deleted boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chemicals_pkey PRIMARY KEY (chemical_id)
);
CREATE TABLE public.lab_assets (
  asset_id integer NOT NULL DEFAULT nextval('lab_assets_asset_id_seq'::regclass),
  item_name character varying NOT NULL,
  category text NOT NULL CHECK (category = ANY (ARRAY['Glassware'::text, 'Equipment'::text])),
  total_stock integer DEFAULT 0 CHECK (total_stock >= 0),
  available_stock integer DEFAULT 0,
  condition_notes text,
  is_deleted boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lab_assets_pkey PRIMARY KEY (asset_id)
);
CREATE TABLE public.reservations (
  reservation_id integer NOT NULL DEFAULT nextval('reservations_reservation_id_seq'::regclass),
  user_id uuid,
  room_id integer,
  reservation_date date NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  year text,
  section character varying,
  professor character varying,
  professor_approval text NOT NULL DEFAULT 'Pending'::text CHECK (professor_approval = ANY (ARRAY['Pending'::text, 'Approved'::text, 'Completed'::text, 'Cancelled'::text, 'Declined'::text])),
  admin_approval text NOT NULL DEFAULT 'Pending'::text CHECK (admin_approval = ANY (ARRAY['Pending'::text, 'Approved'::text, 'Completed'::text, 'Cancelled'::text, 'Declined'::text])),
  status text NOT NULL DEFAULT 'Pending'::text CHECK (status = ANY (ARRAY['Pending'::text, 'Approved'::text, 'Ongoing'::text, 'Partially Returned'::text, 'Completed'::text, 'Cancelled'::text])),
  additional_note character varying,
  is_deleted boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reservations_pkey PRIMARY KEY (reservation_id),
  CONSTRAINT reservations_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(room_id),
  CONSTRAINT reservations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id)
);
CREATE TABLE public.reservation_items (
  detail_id integer NOT NULL DEFAULT nextval('reservation_items_detail_id_seq'::regclass),
  reservation_id integer,
  asset_id integer,
  quantity_borrowed integer DEFAULT 0 CHECK (quantity_borrowed >= 0),
  quantity_returned integer NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
  is_returned boolean DEFAULT false,
  is_deleted boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reservation_items_pkey PRIMARY KEY (detail_id),
  CONSTRAINT reservation_items_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES public.reservations(reservation_id),
  CONSTRAINT reservation_items_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.lab_assets(asset_id)
);
CREATE TABLE public.chemical_usage (
  usage_id integer NOT NULL DEFAULT nextval('chemical_usage_usage_id_seq'::regclass),
  reservation_id integer,
  chemical_id integer,
  quantity_used numeric CHECK (quantity_used >= 0::numeric),
  unit character varying,
  purpose text,
  is_deleted boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chemical_usage_pkey PRIMARY KEY (usage_id),
  CONSTRAINT chemical_usage_chemical_id_fkey FOREIGN KEY (chemical_id) REFERENCES public.chemicals(chemical_id),
  CONSTRAINT chemical_usage_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES public.reservations(reservation_id)
);
CREATE TABLE public.stock_history (
  history_id integer NOT NULL DEFAULT nextval('stock_history_history_id_seq'::regclass),
  item_type text NOT NULL CHECK (item_type = ANY (ARRAY['chemical'::text, 'asset'::text])),
  item_id integer NOT NULL,
  previous_quantity numeric,
  new_quantity numeric,
  change_reason text,
  changed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stock_history_pkey PRIMARY KEY (history_id),
  CONSTRAINT stock_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.user_info (
  id uuid NOT NULL,
  username text,
  email text,
  first_name text,
  last_name text,
  middle_name text,
  phone text,
  role text NOT NULL DEFAULT 'student'::text CHECK (role = ANY (ARRAY['admin'::text, 'student'::text, 'professor'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_banned boolean DEFAULT false,
  CONSTRAINT user_info_pkey PRIMARY KEY (id),
  CONSTRAINT user_info_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.announcement (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  created_by uuid NOT NULL,
  publish_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT announcement_pkey PRIMARY KEY (id),
  CONSTRAINT announcement_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_info(id)
);