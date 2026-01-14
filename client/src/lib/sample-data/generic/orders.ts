/**
 * Sample generic B2B order data
 * Template orders for various product/service types
 */

export function generateGenericOrders(customerId: string, customerName: string) {
  const baseDate = Date.now() - 14 * 24 * 60 * 60 * 1000; // 14 days ago

  return [
    {
      customerId,
      customerName,
      orderDate: baseDate,
      deliveryDate: baseDate + 3 * 24 * 60 * 60 * 1000,
      totalValue: 900.00,
      status: "delivered" as const,
      notes: "Initial setup order",
      items: [
        { productName: "Standard Service Package", quantity: 2, unitPrice: 450.00 },
      ],
    },
    {
      customerId,
      customerName,
      orderDate: baseDate + 10 * 24 * 60 * 60 * 1000,
      deliveryDate: baseDate + 13 * 24 * 60 * 60 * 1000,
      totalValue: 675.00,
      status: "confirmed" as const,
      notes: "Add-on services",
      items: [
        { productName: "Premium Widget Set", quantity: 3, unitPrice: 125.00 },
        { productName: "Training Module - Basic", quantity: 1, unitPrice: 350.00 },
      ],
    },
  ];
}
