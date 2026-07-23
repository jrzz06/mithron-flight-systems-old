import { cn } from "@/lib/utils";
import styles from "./product-shelf-container.module.css";

type ProductShelfContainerProps = React.ComponentPropsWithoutRef<"div">;

export function ProductShelfContainer({ children, className, ...props }: ProductShelfContainerProps) {
  return (
    <div className={cn(styles.root, className)} data-product-shelf-container="true" {...props}>
      {children}
    </div>
  );
}
