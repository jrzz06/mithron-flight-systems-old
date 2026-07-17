import { Select } from "@/components/platform/form-field";

type WarehouseCodeSelectProps = {
  name?: string;
  warehouses: Array<{ code: string; name: string }>;
  defaultValue: string;
  className?: string;
  required?: boolean;
  label?: string;
};

export function WarehouseCodeSelect({
  name = "warehouse_code",
  warehouses,
  defaultValue,
  className,
  required = true,
  label = "Warehouse"
}: WarehouseCodeSelectProps) {
  return (
    <label className="grid gap-1.5">
      <span className="platform-type-caption font-medium">{label}</span>
      <Select name={name} defaultValue={defaultValue} required={required} className={className}>
        {warehouses.map((warehouse) => (
          <option key={warehouse.code} value={warehouse.code}>
            {warehouse.name} ({warehouse.code})
          </option>
        ))}
      </Select>
    </label>
  );
}
