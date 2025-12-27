import { useState, useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { FileText, Download, Copy, Calendar, Check } from "lucide-react";
import { 
  generateDutyReport, getDutyReports, getDefaultDutyPeriod, formatCurrency,
  type DutyReport,
  DATA_SOURCE
} from "@/lib/brewcrmService";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export default function BrewCrmDutyReportPage() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  
  const defaultPeriod = useMemo(() => getDefaultDutyPeriod(), []);
  
  const [periodStart, setPeriodStart] = useState<string>(() => 
    new Date(defaultPeriod.start).toISOString().split('T')[0]
  );
  const [periodEnd, setPeriodEnd] = useState<string>(() =>
    new Date(defaultPeriod.end).toISOString().split('T')[0]
  );
  
  const [currentReport, setCurrentReport] = useState<DutyReport | null>(null);
  const [savedReports, setSavedReports] = useState<DutyReport[]>(() => getDutyReports(workspaceId));
  const [copied, setCopied] = useState(false);
  
  const handleGenerateReport = () => {
    try {
      const report = generateDutyReport(
        workspaceId,
        new Date(periodStart).getTime(),
        new Date(periodEnd).getTime()
      );
      setCurrentReport(report);
      setSavedReports(getDutyReports(workspaceId));
      toast({ title: "Report generated" });
    } catch (error) {
      toast({ title: "Failed to generate report", variant: "destructive" });
    }
  };
  
  // HMRC-friendly text format
  const hmrcText = useMemo(() => {
    if (!currentReport) return '';
    
    const lines = [
      `DUTY RETURN - ${formatDate(currentReport.periodStart)} to ${formatDate(currentReport.periodEnd)}`,
      '',
      'Category\tVolume (HL)\tRate (£/HL)\tDuty Payable (£)',
      '=' .repeat(70),
    ];
    
    for (const line of currentReport.lines) {
      lines.push(
        `${line.displayCategory}\t${line.totalHl.toFixed(2)}\t${(line.ratePerHl / 100).toFixed(2)}\t${(line.dutyPayable / 100).toFixed(2)}`
      );
    }
    
    lines.push('=' .repeat(70));
    lines.push(`TOTAL\t${currentReport.grandTotalHl.toFixed(2)}\t\t${(currentReport.grandTotalDuty / 100).toFixed(2)}`);
    lines.push('');
    lines.push(`Generated: ${new Date(currentReport.generatedAt).toLocaleString()}`);
    
    return lines.join('\n');
  }, [currentReport]);
  
  const handleCopyHmrc = async () => {
    try {
      await navigator.clipboard.writeText(hmrcText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-semibold">Duty Report</h1>
          <Badge variant="secondary">PARTIAL</Badge>
        </div>
        <p className="text-muted-foreground">
          Generate monthly duty reports for HMRC submission (26th→25th period).
        </p>
        <p className="text-xs text-muted-foreground mt-1">Data Source: {DATA_SOURCE}</p>
      </div>
      
      {/* Date Range Selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Report Period
          </CardTitle>
          <CardDescription>
            Default: 26th of previous month to 25th of current month (HMRC duty period)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div>
              <Label>Period Start</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label>Period End</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
            <Button onClick={handleGenerateReport}>
              <FileText className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Current Report */}
      {currentReport && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Duty Return</CardTitle>
                  <CardDescription>
                    {formatDate(currentReport.periodStart)} to {formatDate(currentReport.periodEnd)}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyHmrc}>
                    {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                    {copied ? "Copied!" : "Copy for HMRC"}
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Duty Category</TableHead>
                    <TableHead className="text-right">Volume (HL)</TableHead>
                    <TableHead className="text-right">Rate (£/HL)</TableHead>
                    <TableHead className="text-right">Duty Payable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentReport.lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No deliveries found in this period
                      </TableCell>
                    </TableRow>
                  ) : (
                    currentReport.lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{line.displayCategory}</TableCell>
                        <TableCell className="text-right">{line.totalHl.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.ratePerHl)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(line.dutyPayable)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  <TableRow className="bg-muted/30 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">{currentReport.grandTotalHl.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right text-lg">{formatCurrency(currentReport.grandTotalDuty)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          {/* HMRC Copy-Paste View */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>HMRC Copy/Paste Format</CardTitle>
              <CardDescription>
                Plain text format suitable for pasting into HMRC forms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto whitespace-pre-wrap font-mono">
                {hmrcText}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
      
      {/* No Report State */}
      {!currentReport && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Select a date range and click "Generate Report" to create a duty return.</p>
            <p className="text-sm mt-2">
              Reports are calculated from delivered orders in the period.
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Saved Reports History */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Report History</CardTitle>
          <CardDescription>Previously generated duty reports</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Total HL</TableHead>
                <TableHead className="text-right">Total Duty</TableHead>
                <TableHead className="text-right">Generated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {savedReports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No reports generated yet
                  </TableCell>
                </TableRow>
              ) : (
                savedReports.slice(-10).reverse().map(report => (
                  <TableRow 
                    key={report.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setCurrentReport(report)}
                  >
                    <TableCell>
                      {formatDate(report.periodStart)} - {formatDate(report.periodEnd)}
                    </TableCell>
                    <TableCell className="text-right">{report.grandTotalHl.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(report.grandTotalDuty)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {new Date(report.generatedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

