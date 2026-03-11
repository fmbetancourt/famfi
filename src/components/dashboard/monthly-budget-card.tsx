import { TrendingDown } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface MonthlyBudgetCardProps {
  planned: number;
  spent: number;
  month: string;
}

function formatCLP(amount: number): string {
  return "$" + amount.toLocaleString("de-DE");
}

function progressColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-green-500";
}

function progressTextColor(pct: number): string {
  if (pct >= 90) return "text-red-600";
  if (pct >= 70) return "text-yellow-600";
  return "text-green-600";
}

export function MonthlyBudgetCard({
  planned,
  spent,
  month,
}: MonthlyBudgetCardProps) {
  const pct = planned > 0 ? Math.round((spent / planned) * 100) : 0;
  const remaining = planned - spent;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="size-4 text-muted-foreground" />
          Gasto del Mes
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{month}</span>
            <span className={progressTextColor(pct)}>{pct}%</span>
          </div>
          <div className="mt-2 h-3 rounded-full bg-muted">
            <div
              className={`h-3 rounded-full transition-all ${progressColor(pct)}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Presupuesto</p>
            <p className="text-lg font-semibold">{formatCLP(planned)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Gastado</p>
            <p className="text-lg font-semibold">{formatCLP(spent)}</p>
          </div>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Disponible: </span>
          <span className="font-semibold">
            {formatCLP(Math.max(remaining, 0))}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
