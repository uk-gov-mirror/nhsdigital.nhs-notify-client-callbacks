terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.13"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  required_version = ">= 1.10.1"
}
