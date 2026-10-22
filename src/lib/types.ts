export type Role = 'admin' | 'branch_manager' | 'staff';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  branchIds: string[];
  active: boolean;
}

export type PermissionMap = Record<string, boolean | number | null>;

export interface Branch {
  _id: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  active: boolean;
  isDefaultOnlineBranch?: boolean;
}

export interface Brand {
  _id: string;
  name: string;
  active: boolean;
}

export interface Category {
  _id: string;
  name: string;
  appliesTo: 'contact_lens' | 'other';
  active: boolean;
}

export interface Product {
  _id: string;
  name: string;
  shortCode: string;
  brandId?: Brand | string;
  categoryId?: Category | string;
  type: 'contact_lens' | 'other';
  seriesName?: string;
  dia?: number;
  bc?: number;
  wearDurationDays?: number;
  unitOfMeasure: string;
  defaultPriceRegular: number;
  defaultPowerPriceRegular?: number | null;
  defaultCost: number;
  defaultMinStockLevel: number;
  description?: string;
  images: string[];
  active: boolean;
}

export interface ProductVariant {
  _id: string;
  productId: string;
  colorName?: string;
  images: string[];
  active: boolean;
}

export interface ProductSku {
  _id: string;
  productId: string | Product;
  variantId?: string;
  skuCode: string;
  barcode: string;
  power?: number;
  priceRegular: number;
  priceMember?: number;
  priceSpecial?: number;
  cost?: number; // absent when the caller cannot view cost
  minStockLevel: number;
  unitOfMeasure: string;
  active: boolean;
  qtyOnHand?: number;
}

export interface MemberLevel {
  _id: string;
  name: string;
  thresholdSpend: number;
  benefitsDescription?: string;
  active: boolean;
}

export interface Customer {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  birthday?: string;
  lineUserId?: string;
  memberLevelId?: string | MemberLevel | null;
  points: number;
  totalSpend: number;
  createdAt?: string;
}

export interface ShiftSession {
  _id: string;
  branchId: string;
  userId: string;
  openedAt: string;
  openingFloat: number;
  status: 'open' | 'pending_review' | 'approved' | 'reopened';
  closingCashCounted?: number;
  closingTransferCounted?: number;
  cashVariance?: number;
}

export interface Sale {
  _id: string;
  branchId: string;
  shiftSessionId: string;
  customerId?: string | Customer;
  subtotal: number;
  discountTotal: number;
  netTotal: number;
  paymentStatus: string;
  status: 'completed' | 'voided';
  soldBy: string;
  createdAt: string;
}

export interface Order {
  _id: string;
  branchId: string;
  customerId?: string | Customer;
  channel: string;
  subtotal: number;
  discountTotal: number;
  netTotal: number;
  orderStatus: string;
  paymentStatus: string;
  shippingMethod?: string;
  shippingAddress?: string;
  createdAt: string;
}

export interface StockTransfer {
  _id: string;
  fromBranchId: string | Branch;
  toBranchId: string | Branch;
  status: 'sent' | 'in_transit' | 'received' | 'cancelled';
  sentAt: string;
}

export interface Refund {
  _id: string;
  branchId: string;
  originalType: 'Sale' | 'Order';
  originalId: string;
  type: 'refund' | 'exchange';
  status: 'pending' | 'approved' | 'rejected';
  totalRefundAmount: number;
  reason: string;
  createdAt: string;
}
