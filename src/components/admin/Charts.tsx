import { SalesTrendChart, TopProductsChart } from "./DashboardCharts";
import type { AdminOrder } from "../../services/admin";
import type { AdminDashboardMetrics } from "../../services/admin";

export default function Charts(props: {
  orders: AdminOrder[];
  products: AdminDashboardMetrics["top_products"];
}) {
  return (
    <>
      <SalesTrendChart orders={props.orders} />
      <TopProductsChart products={props.products} />
    </>
  );
}

export { SalesTrendChart, TopProductsChart };
