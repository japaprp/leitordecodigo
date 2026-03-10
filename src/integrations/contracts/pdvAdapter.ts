import { AuthResult, OrderPayload, Product, SendResult, UserRole } from '../../core/types/models';

export interface PdvAdapter {
  authenticate(params: {
    tenantId: string;
    licenseKey: string;
    username: string;
    password: string;
    role: UserRole;
  }): Promise<AuthResult>;
  fetchProductByBarcode(tenantId: string, barcode: string): Promise<Product | null>;
  sendOrder(payload: OrderPayload): Promise<SendResult>;
  findProcessedAction(tenantId: string, clientOrderId: string): Promise<{ externalId: string } | null>;
  getOrderStatus(tenantId: string, externalId: string): Promise<'pending' | 'sent' | 'error'>;
}
