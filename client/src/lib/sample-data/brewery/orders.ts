/**
 * Sample brewery order data
 * Template orders that can be customized for each customer
 */

export function generateBreweryOrders(customerId: string, customerName: string) {
  const baseDate = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago

  return [
    {
      customerId,
      customerName,
      orderDate: baseDate,
      deliveryDate: baseDate + 2 * 24 * 60 * 60 * 1000,
      totalValue: 360.00,
      status: "delivered" as const,
      notes: "Regular weekly order",
      items: [
        { productName: "Sussex Best Bitter", quantity: 3, unitPrice: 72.50 },
        { productName: "Harvest Pale", quantity: 2, unitPrice: 95.00 },
      ],
    },
    {
      customerId,
      customerName,
      orderDate: baseDate + 7 * 24 * 60 * 60 * 1000,
      deliveryDate: baseDate + 9 * 24 * 60 * 60 * 1000,
      totalValue: 287.50,
      status: "confirmed" as const,
      notes: "Next week delivery",
      items: [
        { productName: "Porter", quantity: 2, unitPrice: 75.00 },
        { productName: "Golden Ale", quantity: 2, unitPrice: 70.00 },
      ],
    },
  ];
}
