/**
 * Sample animal physiotherapy order data
 * Template orders for physiotherapy services
 */

export function generateAnimalPhysioOrders(customerId: string, customerName: string) {
  const baseDate = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago

  return [
    {
      customerId,
      customerName,
      orderDate: baseDate,
      deliveryDate: baseDate + 1 * 24 * 60 * 60 * 1000,
      totalValue: 205.00,
      status: "delivered" as const,
      notes: "Initial consultation and first treatment session",
      items: [
        { productName: "Initial Consultation & Assessment", quantity: 1, unitPrice: 85.00 },
        { productName: "Equine Physiotherapy Session", quantity: 1, unitPrice: 65.00 },
        { productName: "Home Visit Fee", quantity: 1, unitPrice: 25.00 },
        { productName: "Kinesiology Taping", quantity: 1, unitPrice: 20.00 },
        { productName: "Electrotherapy Treatment", quantity: 1, unitPrice: 35.00 },
      ],
    },
    {
      customerId,
      customerName,
      orderDate: baseDate + 7 * 24 * 60 * 60 * 1000,
      deliveryDate: baseDate + 8 * 24 * 60 * 60 * 1000,
      totalValue: 90.00,
      status: "confirmed" as const,
      notes: "Follow-up treatment scheduled",
      items: [
        { productName: "Equine Physiotherapy Session", quantity: 1, unitPrice: 65.00 },
        { productName: "Home Visit Fee", quantity: 1, unitPrice: 25.00 },
      ],
    },
  ];
}
