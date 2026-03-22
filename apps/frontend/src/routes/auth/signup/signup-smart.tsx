import { authClient } from '@mako/shared-frontend'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import {
  getAuthErrorMessage,
  handleAuthSuccess,
} from '#/routes/auth/shared/auth-flow'
import {
  SignupDumb,
  type SignupFormErrors,
  type SignupFormValues,
} from './signup-dumb'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateSignupForm(values: SignupFormValues): SignupFormErrors {
  const errors: SignupFormErrors = {}

  if (values.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters.'
  }

  if (values.email.trim().length === 0) {
    errors.email = 'Email is required.'
  } else if (!EMAIL_REGEX.test(values.email)) {
    errors.email = 'Enter a valid email address.'
  }

  if (values.password.trim().length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }

  return errors
}

export function hasSignupErrors(errors: SignupFormErrors): boolean {
  return (
    typeof errors.name === 'string' ||
    typeof errors.email === 'string' ||
    typeof errors.password === 'string'
  )
}

export function SignupSmart() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [values, setValues] = useState<SignupFormValues>({
    name: '',
    email: '',
    password: '',
  })
  const [errors, setErrors] = useState<SignupFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const signupMutation = useMutation({
    mutationFn: function signUpWithEmail(input: SignupFormValues) {
      return authClient.signUp.email(input)
    },
    onSuccess: async function onSignupSuccess() {
      await handleAuthSuccess(queryClient, function navigateToDashboard(path) {
        return navigate({ to: path })
      })
    },
    onError: function onSignupError(error: unknown) {
      setFormError(getAuthErrorMessage(error))
    },
  })

  function handleValueChange(field: keyof SignupFormValues, value: string) {
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

    const validationErrors = validateSignupForm(values)
    if (hasSignupErrors(validationErrors)) {
      setErrors(validationErrors)
      return
    }

    setErrors({})
    signupMutation.mutate(values)
  }

  return (
    <SignupDumb
      values={values}
      errors={errors}
      formError={formError}
      isSubmitting={signupMutation.isPending}
      onValueChange={handleValueChange}
      onSubmit={handleSubmit}
    />
  )
}
