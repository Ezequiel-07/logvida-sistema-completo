
"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface FinancialData {
  name: string
  faturamentoBruto: number
  faturamentoConcluido: number
  custosFixos: number
  custosVariaveis: number
  resultadoRealizado: number;
}

interface FinancialChartProps {
  data: FinancialData[]
}

const chartConfig = {
  faturamentoBruto: {
    label: "Faturamento (Potencial)",
    color: "hsl(var(--primary))",
  },
  faturamentoConcluido: {
    label: "Faturamento (Realizado)",
    color: "hsl(var(--profit))",
  },
  custosVariaveis: {
    label: "Custos Variáveis",
    color: "hsl(var(--variable-costs))",
  },
  custosFixos: {
    label: "Custos Fixos",
    color: "hsl(var(--fixed-costs))",
  },
  resultadoRealizado: {
    label: "Resultado (Lucro/Prejuízo)",
    color: "hsl(var(--accent))",
  },
}

export function FinancialChart({ data }: FinancialChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gráfico Financeiro</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Não há dados suficientes para exibir o gráfico.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full print:min-h-[200px]">
      <ResponsiveContainer>
        <BarChart data={data} barGap={2} barCategoryGap="20%">
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="name"
            tickLine={false}
            tickMargin={5}
            axisLine={false}
            tickFormatter={(value) => value.slice(0, 3)}
            style={{ fontSize: "10px" }}
          />
          <YAxis
            tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`}
            style={{ fontSize: "10px" }}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={<ChartTooltipContent
                formatter={(value, name) => {
                    const numberValue = Number(value);
                    if ( (name === "resultadoRealizado") && numberValue < 0) {
                        return `(R$ ${Math.abs(numberValue).toFixed(2)})`
                    }
                    return `R$ ${numberValue.toFixed(2)}`
                }}
                indicator="dot"
                className="print:text-[10px]"
                labelClassName="print:text-[10px]"
             />}
          />
          <Legend wrapperStyle={{ fontSize: "10px", paddingTop: '10px' }} />
          <Bar dataKey="faturamentoBruto" fill="var(--color-faturamentoBruto)" radius={2} />
          <Bar dataKey="faturamentoConcluido" fill="var(--color-faturamentoConcluido)" radius={2} />
          <Bar dataKey="custosVariaveis" fill="var(--color-custosVariaveis)" radius={2} />
          <Bar dataKey="custosFixos" fill="var(--color-custosFixos)" radius={2} />
          <Bar dataKey="resultadoRealizado" fill="var(--color-resultadoRealizado)" radius={2} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}
