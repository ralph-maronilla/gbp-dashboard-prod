"use client";

import { useState } from "react";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField, { type TextFieldProps } from "@mui/material/TextField";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

/** Password box with a lock icon and a show/hide button. `valid` turns the helper text green (a rule is met). */
export function PasswordField({ valid, ...props }: Omit<TextFieldProps, "type"> & { valid?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      {...props}
      type={shown ? "text" : "password"}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <LockOutlinedIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <IconButton edge="end" size="small" aria-label={shown ? "Hide password" : "Show password"} onClick={() => setShown((s) => !s)} onMouseDown={(e) => e.preventDefault()}>
                {shown ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        },
        formHelperText: { sx: valid ? { color: "success.main" } : undefined },
      }}
    />
  );
}
