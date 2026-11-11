import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";

export function NoAccess({ message = "You do not have access to this page." }: { message?: string }) {
  return (
    <Alert severity="warning">
      <AlertTitle>No access</AlertTitle>
      {message}
    </Alert>
  );
}
