/**
 * Sample data aggregator
 * Routes to industry-specific sample data based on vertical
 */

import { breweryCustomers } from "./brewery/customers";
import { breweryProducts } from "./brewery/products";
import { generateBreweryOrders } from "./brewery/orders";

import { genericCustomers } from "./generic/customers";
import { genericProducts } from "./generic/products";
import { generateGenericOrders } from "./generic/orders";

import { animalPhysioCustomers } from "./animal-physio/customers";
import { animalPhysioProducts } from "./animal-physio/products";
import { generateAnimalPhysioOrders } from "./animal-physio/orders";

export type Vertical = "brewery" | "generic" | "animal_physio" | "other";

interface SampleDataResult {
  customers: any[];
  products: any[];
  orders: any[];
}

/**
 * Generate industry-specific sample data for a given vertical
 * @param vertical - The industry vertical (brewery, generic, animal_physio, other)
 * @returns Sample customers, products, and orders with isSample flag set
 */
export function generateSampleData(vertical: Vertical): SampleDataResult {
  let customers: any[] = [];
  let products: any[] = [];
  let orders: any[] = [];

  switch (vertical) {
    case "brewery":
      customers = breweryCustomers.map((c) => ({ ...c, isSample: true }));
      products = breweryProducts.map((p) => ({ ...p, isSample: true }));
      // Generate orders for each customer
      orders = breweryCustomers.flatMap((customer, index) =>
        generateBreweryOrders(`sample-customer-${index}`, customer.name).map((o) => ({
          ...o,
          isSample: true,
        }))
      );
      break;

    case "animal_physio":
      customers = animalPhysioCustomers.map((c) => ({ ...c, isSample: true }));
      products = animalPhysioProducts.map((p) => ({ ...p, isSample: true }));
      // Generate orders for each customer
      orders = animalPhysioCustomers.flatMap((customer, index) =>
        generateAnimalPhysioOrders(`sample-customer-${index}`, customer.name).map((o) => ({
          ...o,
          isSample: true,
        }))
      );
      break;

    case "generic":
    case "other":
    default:
      customers = genericCustomers.map((c) => ({ ...c, isSample: true }));
      products = genericProducts.map((p) => ({ ...p, isSample: true }));
      // Generate orders for each customer
      orders = genericCustomers.flatMap((customer, index) =>
        generateGenericOrders(`sample-customer-${index}`, customer.name).map((o) => ({
          ...o,
          isSample: true,
        }))
      );
      break;
  }

  return { customers, products, orders };
}

/**
 * Get sample customers for a specific vertical
 */
export function getSampleCustomers(vertical: Vertical) {
  return generateSampleData(vertical).customers;
}

/**
 * Get sample products for a specific vertical
 */
export function getSampleProducts(vertical: Vertical) {
  return generateSampleData(vertical).products;
}

/**
 * Get sample orders for a specific vertical
 */
export function getSampleOrders(vertical: Vertical) {
  return generateSampleData(vertical).orders;
}
