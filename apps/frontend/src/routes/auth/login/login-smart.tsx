import { authClient } from '@mako/shared-frontend'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import {
  getAuthErrorMessage,
  handleAuthSuccess,
} from '#/routes/auth/shared/auth-flow'
import {
  LoginDumb,
  type LoginFormErrors,
  type LoginFormValues,
} from './login-dumb'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateLoginForm(values: LoginFormValues): LoginFormErrors {
  const errors: LoginFormErrors = {}

  if (values.email.trim().length === 0) {
    errors.email = 'Email is required.'
  } else if (!EMAIL_REGEX.test(values.email)) {
    errors.email = 'Enter a valid email address.'
  }

  if (values.password.trim().length === 0) {
    errors.password = 'Password is required.'
  }

  return errors
}

export function hasLoginErrors(errors: LoginFormErrors): boolean {
  return typeof errors.email === 'string' || typeof errors.password === 'string'
}

export function LoginSmart() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [values, setValues] = useState<LoginFormValues>({
    email: '',
    password: '',
  })
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const signInMutation = useMutation({
    mutationFn: function signInWithEmail(input: LoginFormValues) {
      return authClient.signIn.email(input)
    },
    onSuccess: async function onSignInSuccess() {
      await handleAuthSuccess(queryClient, function navigateToDashboard(path) {
        return navigate({ to: path })
      })
    },
    onError: function onSignInError(error: unknown) {
      setFormError(getAuthErrorMessage(error))
    },
  })

  function handleValueChange(field: keyof LoginFormValues, value: string) {
    setValues(function updateValues(previousValues) {
      return {
        ...previousValues,
        [field]: value,
      }
    })

    setErrors(function clearFieldError(previousErrors) {
      return {
        ...previousErrors,
        [field]: undefined,
      }
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const validationErrors = validateLoginForm(values)
    if (hasLoginErrors(validationErrors)) {
      setErrors(validationErrors)
      return
    }

    setErrors({})
    signInMutation.mutate(values)
  }

  return (
    <LoginDumb
      values={values}
      errors={errors}
      formError={formError}
      isSubmitting={signInMutation.isPending}
      onValueChange={handleValueChange}
      onSubmit={handleSubmit}
    />
  )
}
