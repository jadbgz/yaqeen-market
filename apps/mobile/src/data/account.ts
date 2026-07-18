import { getMobileSupabase } from '@/lib/supabase';

export type MobileOrder = {
  id: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  shopCount: number;
};

export type MobileAddress = {
  id: string;
  label: string;
  recipientName: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
  isDefault: boolean;
};

function requireClient() {
  const client = getMobileSupabase();
  if (!client) throw new Error('mobile_supabase_unconfigured');
  return client;
}

export async function loadMobileOrders(): Promise<MobileOrder[]> {
  const { data, error } = await requireClient().from('orders')
    .select('id,status,total_cents,currency,created_at,shop_orders(id)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((order) => ({
    id: order.id,
    status: order.status,
    totalCents: Number(order.total_cents),
    currency: order.currency,
    createdAt: order.created_at,
    shopCount: order.shop_orders?.length ?? 0,
  }));
}

export async function loadMobileOrder(orderId: string): Promise<MobileOrder | null> {
  const { data: order, error } = await requireClient().from('orders')
    .select('id,status,total_cents,currency,created_at,shop_orders(id)')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;
  return {
    id: order.id, status: order.status, totalCents: Number(order.total_cents),
    currency: order.currency, createdAt: order.created_at, shopCount: order.shop_orders?.length ?? 0,
  };
}

export async function loadMobileAddresses(): Promise<MobileAddress[]> {
  const { data, error } = await requireClient().from('customer_addresses')
    .select('id,label,recipient_name,line1,line2,postal_code,city,country_code,phone,is_default')
    .order('is_default', { ascending: false })
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((address) => ({
    id: address.id, label: address.label, recipientName: address.recipient_name,
    line1: address.line1, line2: address.line2, postalCode: address.postal_code,
    city: address.city, countryCode: address.country_code, phone: address.phone,
    isDefault: address.is_default,
  }));
}

export async function saveMobileAddress(input: {
  label: string; recipientName: string; line1: string; line2?: string;
  postalCode: string; city: string; countryCode: string; phone?: string; isDefault: boolean;
}) {
  const { error } = await requireClient().rpc('save_customer_address', {
    requested_address_id: null,
    requested_label: input.label.trim(),
    requested_recipient_name: input.recipientName.trim(),
    requested_line1: input.line1.trim(),
    requested_line2: input.line2?.trim() || null,
    requested_postal_code: input.postalCode.trim(),
    requested_city: input.city.trim(),
    requested_country_code: input.countryCode.trim().toUpperCase(),
    requested_phone: input.phone?.trim() || null,
    requested_is_default: input.isDefault,
  });
  if (error) throw error;
}

export async function deleteMobileAddress(addressId: string) {
  const { error } = await requireClient().rpc('delete_customer_address', { requested_address_id: addressId });
  if (error) throw error;
}

export async function loadPendingDeletion() {
  const { data, error } = await requireClient().from('account_deletion_requests')
    .select('scheduled_for')
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  return data?.scheduled_for ?? null;
}

export async function requestMobileAccountDeletion() {
  const { error } = await requireClient().rpc('request_account_deletion');
  if (error) throw error;
}

export async function cancelMobileAccountDeletion() {
  const { error } = await requireClient().rpc('cancel_account_deletion');
  if (error) throw error;
}

export async function updateMobilePassword(password: string, currentPassword?: string) {
  const client = requireClient();
  const { data: claims } = await client.auth.getClaims();
  const methods = claims?.claims.amr;
  const recovery = Array.isArray(methods) && methods.some((entry) =>
    typeof entry === 'object' && entry !== null && 'method' in entry && entry.method === 'recovery'
  );
  if (!recovery) {
    const email = typeof claims?.claims.email === 'string' ? claims.claims.email : null;
    if (!email || !currentPassword) throw new Error('current_password_required');
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: currentPassword });
    if (signInError) throw new Error('current_password_invalid');
  }
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}
